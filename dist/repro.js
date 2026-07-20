import 'dotenv/config';
import ai from './configs/ai.ts';
(async () => {
    try {
        const res = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{ role: 'user', parts: [{ text: 'Create a simple thumbnail illustration of a cat' }] }],
            config: { responseModalities: ['TEXT', 'IMAGE'] },
        });
        console.log(JSON.stringify({
            hasCandidates: !!res?.candidates,
            partCount: res?.candidates?.[0]?.content?.parts?.length ?? 0,
            firstPartType: res?.candidates?.[0]?.content?.parts?.[0]?.inlineData ? 'inlineData' : (res?.candidates?.[0]?.content?.parts?.[0]?.text ? 'text' : 'unknown'),
        }, null, 2));
    }
    catch (err) {
        console.error('ERROR:', err?.message || err);
        if (err?.status)
            console.error('STATUS:', err.status);
        if (err?.code)
            console.error('CODE:', err.code);
        process.exit(1);
    }
})();
