
import { supabaseAdmin } from "./supabase";
import { extractTextFromFile } from "./extracttext";

function chunkText(text: string, chunkSize = 500): string[] {
  const words = text.split(" ");
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}

export async function indexFile({
  fileId,
  buffer,
  mimeType,
  fileName,
  userId,
}: {
  fileId: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  userId: string;
}) {
  const text = await extractTextFromFile(buffer, mimeType);
  const chunks = chunkText(text);

  for (const chunk of chunks) {
    const embeddingRes = await anthropic.embeddings.create({
      model: "voyage-3",
      input: chunk,
    });

    const { error } = await supabaseAdmin.from("file_chunks").insert({
      file_id: fileId,
      user_id: userId,
      file_name: fileName,
      content: chunk,
      embedding: embeddingRes.embeddings[0],
    });

    if (error) throw new Error(`Supabase insert error: ${error.message}`);
  }
}