// app/api/smart-query/route.ts
export async function POST(req: Request) {
  const { question, userId } = await req.json();

  // 1. Embed the user's question
  const qEmbedding = await anthropic.embeddings.create({
    model: "voyage-3",
    input: question,
  });

  // 2. Find the most relevant chunks across ALL user's files
  const { data: chunks } = await supabase.rpc("match_file_chunks", {
    query_embedding: qEmbedding.embeddings[0],
    match_user_id: userId,
    match_count: 5,
  });

  // 3. Send matched chunks to Claude with the question
  const context = chunks.map(c => `[From: ${c.file_name}]\n${c.content}`).join("\n\n");

  const stream = await anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Based on these documents from the user's files:\n\n${context}\n\nAnswer: ${question}`,
    }],
  });

  // ... stream response back
}