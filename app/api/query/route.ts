import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { question, userId } = await req.json();

  if (!question || !userId) {
    return Response.json({ error: "question and userId required" }, { status: 400 });
  }

  // 1. Embed the user's question
  const qEmbedding = await anthropic.embeddings.create({
    model: "voyage-3",
    input: question,
  });

  // 2. Find most relevant chunks across all user files
  const { data: chunks, error } = await supabaseAdmin.rpc("match_file_chunks", {
    query_embedding: qEmbedding.embeddings[0],
    match_user_id: userId,
    match_count: 5,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!chunks || chunks.length === 0) {
    return Response.json({ error: "No relevant files found" }, { status: 404 });
  }

  // 3. Build context from matched chunks
  const context = chunks
    .map((c: { file_name: string; content: string }) => `[From: ${c.file_name}]\n${c.content}`)
    .join("\n\n---\n\n");

  // 4. Stream Claude's answer
  const stream = await anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: "You are a helpful assistant that answers questions based only on the user's uploaded files. Always mention which file the answer came from.",
    messages: [
      {
        role: "user",
        content: `Here are relevant sections from my files:\n\n${context}\n\nQuestion: ${question}`,
      },
    ],
  });

  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(new TextEncoder().encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}