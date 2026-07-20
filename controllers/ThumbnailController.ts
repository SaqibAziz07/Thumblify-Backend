import { Request, Response } from "express";
import Thumbnail from "../models/Thumbnail.js";
import axios from "axios";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";

const stylePrompts = {
  "Bold & Graphic":
    "eye-catching thumbnail scene, expressive facial reaction, dramatic lighting, high contrast, click-worthy composition, professional style",
  "Tech/Futuristic":
    "futuristic scene, sleek modern design, digital UI elements, glowing accents, holographic effects, cyber-tech aesthetic, sharp lighting, high-tech atmosphere",
  Minimalist:
    "minimalist scene, clean layout, simple shapes, limited color palette, plenty of negative space, modern flat design, clear focal point",
  Photorealistic:
    "photorealistic scene, ultra-realistic lighting, natural skin tones, candid moment, DSLR-style photography, lifestyle realism, shallow depth of field",
  Illustrated:
    "illustrated scene, custom digital illustration, stylized characters, bold outlines, vibrant colors, creative cartoon or vector art style",
};

const colorSchemeDescriptions = {
  vibrant: "vibrant and energetic colors, high saturation, bold contrasts, eye-catching palette",
  sunset: "warm sunset tones, orange pink and purple hues, soft gradients, cinematic glow",
  forest: "natural green tones, earthy colors, calm and organic palette, fresh atmosphere",
  neon: "neon glow effects, electric blues and pinks, cyberpunk lighting, high contrast glow",
  purple: "purple-dominant color palette, magenta and violet tones, modern and stylish mood",
  monochrome: "black and white color scheme, high contrast, dramatic lighting, timeless aesthetic",
  ocean: "cool blue and teal tones, aquatic color palette, fresh and clean atmosphere",
  pastel: "soft pastel colors, low saturation, gentle tones, calm and friendly aesthetic",
};

// Text accent color per scheme, used for the SVG overlay
const colorSchemeHex: Record<string, string> = {
  vibrant: "#FFD400",
  sunset: "#FF7A45",
  forest: "#7BE38B",
  neon: "#39FFEA",
  purple: "#D9A3FF",
  monochrome: "#FFFFFF",
  ocean: "#5FD3FF",
  pastel: "#FFC9E3",
};

const aspectRatioToSize: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "1:1": { width: 1024, height: 1024 },
  "9:16": { width: 720, height: 1280 },
};

// Very simple word-wrap so long titles don't run off the edge
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current += " " + word;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

// Strip words that would confuse the AI into drawing fake text on the image.
// The overlay text/color/position is controlled entirely by code, never by the prompt.
function sanitizeScenePrompt(rawPrompt: string): string {
  if (!rawPrompt) return "";
  const bannedWords = /\b(text|caption|word|letter|title|font|typography|written)\b/gi;
  return rawPrompt.replace(bannedWords, "").replace(/\s+/g, " ").trim();
}

function buildTextOverlaySvg(
  title: string,
  width: number,
  height: number,
  accentColor: string,
  position: "top" | "bottom" = "top"
): string {
  // Max 2 lines, capped chars/line so it never swallows the whole frame
  const lines = wrapText(title.toUpperCase(), 20).slice(0, 2);

  // Font scales down automatically as line count / title length grows
  const baseFontSize = width * 0.075;
  const fontSize = Math.round(baseFontSize / (lines.length > 1 ? 1.15 : 1));
  const lineHeight = fontSize * 1.15;

  const bandHeight = lines.length * lineHeight + height * 0.05;
  const startY =
    position === "top"
      ? fontSize * 1.1
      : height - bandHeight + fontSize * 0.9;

  const gradientStop2 = "#FFFFFF"; // light blue -> white gradient (neon-style)

  const textElements = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `
        <text x="50%" y="${y}" 
          font-family="Arial Black, Impact, sans-serif" 
          font-weight="900" 
          font-size="${fontSize}" 
          text-anchor="middle" 
          fill="url(#textGradient)" 
          stroke="black" 
          stroke-width="${fontSize * 0.035}" 
          paint-order="stroke fill"
          filter="url(#glow)">
          ${line}
        </text>`;
    })
    .join("");

  const shadowY = position === "top" ? 0 : height * 0.62;
  const shadowHeight = height * 0.38;

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="textGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${accentColor}"/>
          <stop offset="100%" stop-color="${gradientStop2}"/>
        </linearGradient>
        <linearGradient id="shadow" x1="0" y1="${position === "top" ? "1" : "0"}" x2="0" y2="${position === "top" ? "0" : "1"}">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.6"/>
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="${fontSize * 0.06}" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <rect x="0" y="${shadowY}" width="${width}" height="${shadowHeight}" fill="url(#shadow)" />
      ${textElements}
    </svg>`;
}

export const generateThumbnail = async (req: Request, res: Response) => {
  try {
    const { userId } = req.session;
    const {
      title,
      prompt: user_prompt,
      style,
      aspect_ratio,
      color_scheme,
      text_overlay,
      text_position, // "top" | "bottom" (optional, defaults to "top")
    } = req.body;

    const thumbnail = await Thumbnail.create({
      userId,
      title,
      prompt_used: user_prompt,
      user_prompt,
      style,
      aspect_ratio,
      color_scheme,
      text_overlay,
      isGenerating: true,
    });

    // ---- Build the scene prompt (NO title text asked from the AI) ----
    let prompt = `Create a ${stylePrompts[style as keyof typeof stylePrompts]}, related to the theme: "${title}"`;

    if (color_scheme) {
      prompt += ` use a ${colorSchemeDescriptions[color_scheme as keyof typeof colorSchemeDescriptions]} color scheme.`;
    }

    const cleanUserPrompt = sanitizeScenePrompt(user_prompt);
    if (cleanUserPrompt) {
      prompt += ` Additional details: "${cleanUserPrompt}".`;
    }

    prompt += ` Visually stunning, designed to maximize click-through rate, bold and professional. No text, no letters, no words, no captions, no watermark, no logos.`;

    // ---- Generate base scene via Pollinations ----
    const { width, height } = aspectRatioToSize[aspect_ratio] || aspectRatioToSize["16:9"];
    const encodedPrompt = encodeURIComponent(prompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&token=${process.env.POLLINATIONS_TOKEN}`;

    const imageResponse = await axios.get(pollinationsUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
    });

    let finalImageBuffer = Buffer.from(imageResponse.data, "binary");

    // ---- Overlay bold, readable text with Sharp (only if requested) ----
    if (text_overlay) {
      const accentColor = colorSchemeHex[color_scheme] || "#FFFFFF";
      const position = text_position === "bottom" ? "bottom" : "top";
      const svgOverlay = buildTextOverlaySvg(title, width, height, accentColor, position);

      finalImageBuffer = await sharp(finalImageBuffer)
        .resize(width, height)
        .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
        .png()
        .toBuffer();
    }

    // ---- Upload composited image to Cloudinary ----
    const base64Image = finalImageBuffer.toString("base64");
    const dataUri = `data:image/png;base64,${base64Image}`;

    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      resource_type: "image",
      folder: "thumbnails",
    });

    thumbnail.image_url = uploadResult.secure_url;
    thumbnail.isGenerating = false;
    await thumbnail.save();

    res.json({ message: "Thumbnail generated", thumbnail });
  } catch (error: any) {
    console.log(error);

    if (req.body?.title) {
      await Thumbnail.findOneAndUpdate(
        { title: req.body.title, isGenerating: true },
        { isGenerating: false }
      ).catch(() => {});
    }

    res.status(500).json({ message: error.message });
  }
};

// Controllers for Thumbnail Deletion
export const deleteThumbnail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.session;

    await Thumbnail.findByIdAndDelete({ _id: id, userId });
    res.json({ message: "Thumbnail deleted successfully" });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};