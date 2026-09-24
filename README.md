# Job Tracker

A local-first job search tracker built with Next.js, Prisma, and SQLite. It keeps applications, follow-ups, recruiters, reminders, and daily notes in one place, captures applications from the browser as you apply, and includes an AI assistant that drafts follow-ups and answers questions grounded in each job posting. Every generated draft needs your approval before it can be used.

Everything runs on your own machine. The AI features use local [Ollama](https://ollama.com) models, so no paid API is required.

## Features

**Daily workflow**

- **Today agenda**: one prioritized list of overdue items, today's tasks, and the next 7 days, combining reminders, follow-ups, and drafts waiting for review, with a daily application goal, quick add forms, and notes.
- **Pipeline**: search and filter every application and change its stage (applied, interview, offer, rejected) right from the card.
- **Calendar**: a month view that marks days with applications, reminders, follow-ups, and notes. Click any day to add a reminder, a note, or an application on that date.
- **Reminders**: create, edit, and check off reminders for any day, linked to an application.
- **Stats**: applications by stage, follow-up health, reminder load, and how many assistant drafts passed review.
- **CSV export** of all applications with their recruiters and follow-ups.

**Per application**

- **Follow-ups** with a due date, channel (email, LinkedIn, other), status (planned, sent, skipped), and recipient. Reminders attach to a follow-up and move with it.
- **Recruiters**: keep several contacts per application.
- **Contact research** (optional): search public sources for recruiter emails, profiles, and company pages, and save results to a recruiter.

**AI assistant with human review**

- **Sync context** fetches the job posting and combines it with your notes, recruiters, and follow-up history, then indexes it with local embeddings.
- **Draft a follow-up** or **ask a question** about the application. The assistant retrieves the most relevant sources and writes a draft that cites them.
- **Nothing is used until you approve it.** Drafts land in a review queue where you can edit, approve, or reject them. Copying, emailing, attaching to a follow-up, and saving to notes all go through one endpoint that refuses unapproved drafts, and a follow-up with an attached draft can't be marked sent until that draft is approved.

**Languages and voice**

- **English and Spanish** interface with a switch in the sidebar. Drafts are written in the selected language.
- **Listen** reads a draft aloud with [ElevenLabs](https://elevenlabs.io) (optional).

**Browser extension**

- **Automatic capture** on Greenhouse, Lever, Ashby, Workday, and LinkedIn Easy Apply: when the page confirms your application, it's saved to the tracker with a follow-up planned.
- **One-click save** on any other job page, with the company, role, and link filled in for you.

## Tech stack

- **App:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Data:** Prisma with SQLite
- **AI:** Ollama (`qwen3:8b` for writing, `nomic-embed-text` for embeddings), cosine-similarity retrieval
- **Integrations:** Tavily-compatible search (contact research), ElevenLabs (text to speech)
- **Extension:** Chrome/Edge Manifest V3

## Getting started

Requirements: Node.js 20+, pnpm, and [Ollama](https://ollama.com) for the AI features.

```bash
pnpm install
cp .env.example .env
pnpm prisma migrate dev
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### AI setup

With Ollama running, pull the default models:

```bash
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

On an application's page, click **Sync context**, then generate a draft or ask a question from the assistant panel. On machines with limited memory, `qwen3:4b` is a lighter option for `OLLAMA_RAG_RESPONSE_MODEL`.

### Browser extension setup

1. Set `EXTENSION_TOKEN` in `.env` to a long random string.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked**, and choose the `extension/` folder.
3. In the settings page that opens, paste the same token and click **Test connection**.

The app needs to be running for captures to arrive. Captures made while it's off wait in the extension and are sent once it's back.

## Configuration

All settings live in `.env`. See `.env.example` for the full list.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | SQLite database file, `file:./dev.db` by default |
| `OLLAMA_BASE_URL` | No | Ollama server, `http://127.0.0.1:11434/v1` by default |
| `OLLAMA_RAG_RESPONSE_MODEL` | No | Model that writes drafts and answers |
| `OLLAMA_RAG_EMBEDDING_MODEL` | No | Model that embeds context for retrieval |
| `APPLICANT_NAME` | No | Your name, used to sign drafted messages |
| `EXTENSION_TOKEN` | For the extension | Shared secret between the app and the extension |
| `TAVILY_API_KEY` | For contact research | Search API key; the free tier is enough |
| `ELEVENLABS_API_KEY` | For Listen | Text to speech key |
| `ELEVENLABS_VOICE_ID` | No | Voice to use instead of the default |

## Project structure

```
app/                  Pages and API routes
  api/                Applications, follow-ups, recruiters, reminders, drafts, calendar, stats
  applications/       Pipeline and application detail pages
  calendar/           Month view with the day panel
src/components/       App shell, assistant review queue, language provider, stage picker
src/lib/              Retrieval, prompts, drafts, follow-ups, translations
prisma/               Schema and migrations
extension/            Chrome/Edge extension
```

## Privacy

The database, the AI models, and the extension's queue all stay on your machine. The only outside services are the optional ones you configure: the job posting fetch during sync, Tavily for contact research, and ElevenLabs for Listen.
