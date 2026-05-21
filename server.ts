import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON payload parsing middleware
  app.use(express.json());

  let aiClient: GoogleGenAI | null = null;
  function getGenAI(): GoogleGenAI {
    if (!aiClient) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error("GEMINI_API_KEY environment variable is required.");
      }
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
  }

  // API endpoint for processing transcripts with Gemini
  app.post("/api/process", async (req, res) => {
    try {
      const { transcript, title, department, date, facilitator, format } = req.body;
      
      if (!transcript || !transcript.trim()) {
        return res.status(400).json({ error: "Transcript content feed cannot be empty." });
      }

      const client = getGenAI();

      const systemInstruction = `You are a high-performance backend processing engine for a Meeting Scribe application.
Your sole task is to process the incoming raw meeting transcript, audio dictation, or conversational notes and output a clean, consolidated narrative payload.

Strict output styling and structure guidelines:
1. DO NOT include any structured metadata headers, labels, or fields (such as "Topic:", "Date:", "Facilitator:", "Department:", or "Meeting Format:"). No key-value metadata arrays.
2. DO NOT include any formal introduction, sign-offs, salutations, or conversational agent filler (such as "Here is your processed meeting text:" or "Here is the summary...").
3. Output ONLY the clean, chronological, or logically grouped text of what was discussed, decided, and assigned during the session. Make it highly clear, professional, energetic and executive-ready. Use standard paragraphs and simple bullet points for actions and key decisions.
4. Correct minor grammatical errors, false starts, speaker-label debris, and typical verbal filler words (such as "um", "uh", "you know", "like") from raw speech, but preserve all specific details, names, metrics, timings, and actionable tasks.
5. If the meeting format is a "Live Interactive Meeting", notes/dialogue contain co-mingled speech from multiple participants. Logically segment topics, arguments, decisions and statements based on contextual patterns. If the format is a "Post-Meeting Dictation Summary", treat it as a singular comprehensive recap delivered from the facilitator's perspective.
6. Return only the raw narrative payload. Do not wrap the response in markdown code blocks like \`\`\` or \`\`\`markdown. Go straight into the content itself.`;

      const promptPart = `Session Metadata context elements for context-enrichment:
- Title: ${title || "N/A"}
- Department/Group: ${department || "N/A"}
- Date: ${date || "N/A"}
- Facilitator: ${facilitator || "N/A"}
- Format Context: ${format || "N/A"}

[RAW MIC DATA FEED STREAM]
"${transcript}"`;

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptPart,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.1, // low temperature for factual high-density outputs
        }
      });

      const processedText = response.text || "Empty response returned from the model.";
      res.json({ result: processedText });

    } catch (error: any) {
      console.error("Gemini Scribe API failure:", error);
      res.status(500).json({ error: error.message || "An internal error occurred during AI processing." });
    }
  });

  // Handle client asset serving & Vite livereload bridging
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Scribe Engine running on port ${PORT}`);
  });
}

startServer();
