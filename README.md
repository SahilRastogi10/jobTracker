# Job Tracker

A local-first job application tracker built with Next.js, Prisma, and SQLite. It tracks applications, follow-ups, reminders, daily notes and goals, and includes retrieval-grounded Q&A over each application's job posting, notes, and recruiter context.

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm prisma migrate dev
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI features (free, local by default)

The RAG features run on [Ollama](https://ollama.com) by default, so no paid API is needed.

1. Install Ollama and make sure it is running.
2. Pull the default models:

   ```bash
   ollama pull qwen3:8b
   ollama pull nomic-embed-text
   ```

3. Keep `RAG_PROVIDER="ollama"` in `.env` (this is also the default when unset).
4. On an application's page, click **Sync context** to fetch and embed the job posting, notes, and recruiter context, then ask questions against it.

On machines with limited memory, `qwen3:4b` is a lighter alternative for `OLLAMA_RAG_RESPONSE_MODEL`.

### Using OpenAI instead (optional, paid)

Set `RAG_PROVIDER="openai"` and uncomment the `OPENAI_*` settings in `.env`. Embeddings from different providers are not compatible, so re-sync each application's context after switching.

## Contact research (optional)

Recruiter contact research uses a Tavily-compatible search API. Set `TAVILY_API_KEY` in `.env`; Tavily's free tier is enough for personal use.
