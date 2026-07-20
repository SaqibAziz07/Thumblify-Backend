import Thumbnail from "../models/Thumbnail.js";
import { HarmBlockThreshold, HarmCategory, } from "@google/genai";
import ai from "../configs/ai.js";
import path from "path";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
const stylePrompts = {
    "Bold & Graphic": "eye-catching thumbnail, bold typography, vibrant colors, expressive facial reaction, dramatic lighting, high contrast, click-worthy composition, professional style",
    "Tech/Futuristic": "futuristic thumbnail, sleek modern design, digital UI elements, glowing accents, holographic effects, cyber-tech aesthetic, sharp lighting, high-tech atmosphere",
    Minimalist: "minimalist thumbnail, clean layout, simple shapes, limited color palette, plenty of negative space, modern flat design, clear focal point",
    Photorealistic: "photorealistic thumbnail, ultra-realistic lighting, natural skin tones, candid moment, DSLR-style photography, lifestyle realism, shallow depth of field",
    Illustrated: "illustrated thumbnail, custom digital illustration, stylized characters, bold outlines, vibrant colors, creative cartoon or vector art style",
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
const escapeXml = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
const getCanvasSize = (aspectRatio) => {
    const ratio = aspectRatio || "16:9";
    const [widthRatio, heightRatio] = ratio.split(":").map(Number);
    if (widthRatio && heightRatio) {
        if (ratio === "9:16")
            return { width: 900, height: 1600 };
        if (ratio === "1:1")
            return { width: 1200, height: 1200 };
        if (ratio === "4:3")
            return { width: 1400, height: 1050 };
    }
    return { width: 1600, height: 900 };
};
const wrapText = (text, maxChars) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    words.forEach((word) => {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxChars) {
            current = next;
        }
        else {
            if (current)
                lines.push(current);
            current = word;
        }
    });
    if (current)
        lines.push(current);
    return lines.slice(0, 3);
};
const buildFallbackThumbnailSvg = ({ title, style, color_scheme, aspect_ratio, text_overlay, }) => {
    const { width, height } = getCanvasSize(aspect_ratio);
    const safeTitle = title?.trim() || "Your Amazing Video";
    const safeStyle = style || "Professional";
    const safeOverlay = text_overlay?.trim() || "Click to watch";
    const schemeColors = {
        vibrant: ["#ff5f6d", "#ffc371"],
        sunset: ["#ff7a59", "#f4c95d"],
        forest: ["#2f8f64", "#8fd19e"],
        neon: ["#00d4ff", "#ff2fdc"],
        purple: ["#7c4dff", "#ff4f91"],
        monochrome: ["#111111", "#ffffff"],
        ocean: ["#0ea5e9", "#34d399"],
        pastel: ["#ffb4d9", "#9bd1ff"],
    };
    const [startColor, endColor] = schemeColors[color_scheme || "vibrant"];
    const titleLines = wrapText(safeTitle, 22);
    return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${startColor}" />
          <stop offset="100%" stop-color="${endColor}" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="40" fill="url(#bg)" />
      <circle cx="${width - 260}" cy="220" r="220" fill="rgba(255,255,255,0.16)" />
      <circle cx="220" cy="${height - 180}" r="180" fill="rgba(0,0,0,0.16)" />
      <rect x="90" y="110" width="${width - 180}" height="${height - 220}" rx="30" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.3)" stroke-width="3" />
      <rect x="130" y="160" width="260" height="190" rx="28" fill="rgba(255,255,255,0.18)" />
      <rect x="180" y="215" width="160" height="14" rx="7" fill="rgba(255,255,255,0.8)" />
      <rect x="180" y="245" width="120" height="12" rx="6" fill="rgba(255,255,255,0.55)" />
      <rect x="130" y="390" width="300" height="8" rx="4" fill="rgba(255,255,255,0.25)" />
      <rect x="130" y="412" width="220" height="8" rx="4" fill="rgba(255,255,255,0.2)" />
      <text x="470" y="260" font-size="64" font-family="Arial, sans-serif" font-weight="700" fill="#ffffff">${escapeXml(titleLines[0] || safeTitle)}</text>
      ${titleLines.slice(1).map((line, index) => `<text x="470" y="${320 + index * 56}" font-size="54" font-family="Arial, sans-serif" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`).join("")}
      <text x="470" y="430" font-size="28" font-family="Arial, sans-serif" font-weight="600" fill="#fef3c7">${escapeXml(safeStyle)} • ${escapeXml(safeOverlay)}</text>
      <rect x="470" y="470" width="220" height="54" rx="27" fill="#ffffff" fill-opacity="0.9" />
      <text x="580" y="508" font-size="24" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" fill="#111827">WATCH NOW</text>
    </svg>
  `;
};
const buildFallbackThumbnailBuffer = async ({ title, style, color_scheme, aspect_ratio, text_overlay, }) => {
    const { width, height } = getCanvasSize(aspect_ratio);
    const svg = buildFallbackThumbnailSvg({ title, style, color_scheme, aspect_ratio, text_overlay });
    return sharp(Buffer.from(svg)).resize(width, height).png({ quality: 95 }).toBuffer();
};
export const generateThumbnail = async (req, res) => {
    try {
        const { userId } = req.session;
        const { title, prompt: user_prompt, style, aspect_ratio, color_scheme, text_overlay, } = req.body;
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
        const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
        const generationConfig = {
            maxOutputTokens: 32768,
            temperature: 1,
            topP: 0.95,
            responseModalities: ["IMAGE"],
            imageConfig: {
                aspectRatio: aspect_ratio || "16:9",
                imageSize: "1K",
            },
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.OFF,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.OFF,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.OFF,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.OFF,
                },
            ],
        };
        let prompt = `Create a ${stylePrompts[style]} for: "${title}"`;
        if (color_scheme) {
            prompt += ` use a ${colorSchemeDescriptions[color_scheme]} color scheme.`;
        }
        if (user_prompt) {
            prompt += ` Additional details: "${user_prompt}".`;
        }
        prompt += ` The thumbnail should be ${aspect_ratio} visually stunning, and design to maximize click-through rate.Make it bold, professional, and impossible to ignore.`;
        let finalBuffer = null;
        try {
            const response = await ai.models.generateContent({
                model,
                contents: [prompt],
                config: generationConfig,
            });
            if (!response?.candidates?.[0]?.content?.parts) {
                throw new Error("Unexpected Response");
            }
            const parts = response.candidates[0].content.parts;
            for (const part of parts) {
                const inlineData = part?.inlineData?.data ?? part?.inlineData;
                if (typeof inlineData === "string") {
                    finalBuffer = Buffer.from(inlineData, "base64");
                }
                else if (inlineData && typeof inlineData === "object") {
                    finalBuffer = Buffer.from(inlineData.data, "base64");
                }
            }
        }
        catch (geminiError) {
            console.warn("Gemini image generation failed, using local fallback.", geminiError?.message || geminiError);
        }
        if (!finalBuffer) {
            finalBuffer = await buildFallbackThumbnailBuffer({
                title,
                style,
                color_scheme,
                aspect_ratio,
                text_overlay,
            });
        }
        const fileName = `final-output-${Date.now()}.png`;
        const filePath = path.join("images", fileName);
        // Create the images directory if it doesn't exist
        fs.mkdirSync("images", { recursive: true });
        // Write the final image to the file
        fs.writeFileSync(filePath, finalBuffer);
        const uploadResult = await cloudinary.uploader.upload(filePath, {
            resource_type: "image",
        });
        thumbnail.image_url = uploadResult.url;
        thumbnail.isGenerating = false;
        await thumbnail.save();
        res.json({ message: "Thumbnail generated", thumbnail });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};
// Controllers for Thumbnail Deletion
export const deleteThumbnail = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.session;
        await Thumbnail.findByIdAndDelete({ _id: id, userId });
        res.json({ message: "Thumbnail deleted successfully" });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};
