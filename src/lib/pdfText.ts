// Reads the text of a PDF in the browser with Mozilla's pdf.js, loaded from a CDN on first use.
// Doing it client-side keeps the app free of a PDF dependency and the upload small.

const PDFJS_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build";

type TextItem = { str?: string; hasEOL?: boolean };

type PdfJs = {
  GlobalWorkerOptions: { workerPort: Worker | null };
  getDocument: (source: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: TextItem[] }>;
      }>;
    }>;
  };
};

let pdfjsPromise: Promise<PdfJs> | null = null;

async function createPdfJs() {
  const moduleUrl = `${PDFJS_BASE}/pdf.min.mjs`;
  const pdfjs: PdfJs = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl);

  // Browsers refuse to start a worker straight from another origin, so load the worker
  // script from the CDN and start it from a same-origin blob URL instead.
  const workerSource = await fetch(`${PDFJS_BASE}/pdf.worker.min.mjs`).then((res) => {
    if (!res.ok) throw new Error(`Couldn't load the PDF reader (${res.status}).`);
    return res.text();
  });
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  pdfjs.GlobalWorkerOptions.workerPort = new Worker(workerUrl, { type: "module" });

  return pdfjs;
}

export function loadPdfJs() {
  pdfjsPromise ??= createPdfJs().catch((error) => {
    pdfjsPromise = null; // let a later upload try again
    throw error;
  });
  return pdfjsPromise;
}

export async function extractPdfText(file: File) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const content = await (await doc.getPage(pageNumber)).getTextContent();
    pages.push(
      content.items.map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : ""}`).join("")
    );
  }

  return pages.join("\n");
}
