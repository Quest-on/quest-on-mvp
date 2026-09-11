// Node.js Runtime 사용
export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import mammoth from "mammoth";
import AdmZip from "adm-zip";
import { chunkText, formatChunkMetadata } from "@/lib/chunking";
import { createEmbeddings } from "@/lib/embedding";
import { saveChunksToDB, deleteChunksByFileUrl } from "@/lib/save-chunks";
import { logError } from "@/lib/logger";

// pdf2json 타입 정의 (라이브러리에 타입이 없으므로 직접 정의)
interface PDFTextRun {
  T: string;
}

interface PDFTextItem {
  R?: PDFTextRun[];
}

interface PDFPage {
  Texts?: PDFTextItem[];
}

interface PDFParserData {
  Pages?: PDFPage[];
}

interface PDFParserErrorData {
  parserError?: string;
}

type PDFParserConstructor = new (
  context: null,
  verbosity: number
) => {
  on: (event: string, callback: (data: PDFParserData | PDFParserErrorData) => void) => void;
  parseBuffer: (buffer: Buffer) => void;
};

// pdf2json을 사용하여 PDF 텍스트 추출 (Node.js 전용)
// pdf-parse와 pdfjs-dist는 DOMMatrix 등 브라우저 API를 사용하여 Node.js에서 실패함
let PDFParser: PDFParserConstructor | null = null;

async function getPDFParser(): Promise<PDFParserConstructor> {
  if (!PDFParser) {
    try {
      // pdf2json은 Node.js 전용이므로 안전하게 사용 가능
      // pdf2json에 타입 정의가 없으므로 unknown을 거쳐 변환
      const pdf2jsonModule = await import("pdf2json");
      PDFParser = (pdf2jsonModule.default || pdf2jsonModule) as unknown as PDFParserConstructor;
    } catch (error) {
      throw new Error(
        `pdf2json 모듈을 로드할 수 없습니다: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return PDFParser;
}

// Supabase 클라이언트
const supabase = getSupabaseServer();

/**
 * PDF 파일에서 텍스트 추출 (pdf2json 사용 - Node.js 전용)
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const PDFParserClass = await getPDFParser();

    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParserClass(null, 1);
      const textParts: string[] = [];

      // 텍스트 추출 이벤트 핸들러
      pdfParser.on("pdfParser_dataError", (errData: PDFParserData | PDFParserErrorData) => {
        const errorData = errData as PDFParserErrorData;
        reject(
          new Error(
            `PDF 파싱 실패: ${errorData.parserError || "알 수 없는 오류"}`
          )
        );
      });

      pdfParser.on("pdfParser_dataReady", (pdfData: PDFParserData | PDFParserErrorData) => {
        try {
          const parsedData = pdfData as PDFParserData;
          // 모든 페이지에서 텍스트 추출
          if (parsedData.Pages && Array.isArray(parsedData.Pages)) {
            for (const page of parsedData.Pages) {
              if (page.Texts && Array.isArray(page.Texts)) {
                const pageTexts = page.Texts.map((textObj: PDFTextItem) => {
                  // R 배열에서 텍스트 추출
                  if (textObj.R && Array.isArray(textObj.R)) {
                    return textObj.R.map((r: PDFTextRun) => r.T || "").join("");
                  }
                  return "";
                }).filter((text: string) => text.trim());

                if (pageTexts.length > 0) {
                  textParts.push(pageTexts.join(" "));
                }
              }
            }
          }

          const extractedText = textParts.join("\n\n");
          resolve(extractedText);
        } catch (error) {
          reject(
            new Error(
              `텍스트 추출 실패: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          );
        }
      });

      // PDF 파싱 시작
      pdfParser.parseBuffer(buffer);
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `PDF 파일에서 텍스트를 추출할 수 없습니다: ${errorMessage}`,
    );
  }
}

/**
 * Word 파일(.docx)에서 텍스트 추출
 */
async function extractTextFromWord(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } catch {
    throw new Error("Word 파일에서 텍스트를 추출할 수 없습니다.");
  }
}

/**
 * PPT 파일(.pptx)에서 텍스트 추출
 * PPTX는 ZIP 파일이므로 압축을 풀고 XML에서 텍스트 추출
 */
async function extractTextFromPPT(buffer: Buffer): Promise<string> {
  try {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    const textParts: string[] = [];

    // ppt/slides/ 폴더의 모든 슬라이드 파일 찾기
    const slideFiles = zipEntries.filter(
      (entry) =>
        entry.entryName.startsWith("ppt/slides/slide") &&
        entry.entryName.endsWith(".xml"),
    );

    // 슬라이드 번호 순서대로 정렬
    slideFiles.sort((a, b) => {
      const aNum = parseInt(a.entryName.match(/slide(\d+)/)?.[1] || "0");
      const bNum = parseInt(b.entryName.match(/slide(\d+)/)?.[1] || "0");
      return aNum - bNum;
    });

    // 각 슬라이드에서 텍스트 추출
    for (const slide of slideFiles) {
      const slideXml = slide.getData().toString("utf-8");

      // XML에서 <a:t> 태그 안의 텍스트 추출 (PowerPoint의 텍스트 노드)
      const textMatches = slideXml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
      if (textMatches) {
        for (const match of textMatches) {
          const text = match.replace(/<[^>]*>/g, "").trim();
          if (text) {
            textParts.push(text);
          }
        }
      }

      // <p:sp> (shape) 내부의 텍스트도 추출
      const shapeMatches = slideXml.match(/<p:sp[^>]*>[\s\S]*?<\/p:sp>/g);
      if (shapeMatches) {
        for (const shape of shapeMatches) {
          const shapeTextMatches = shape.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
          if (shapeTextMatches) {
            for (const match of shapeTextMatches) {
              const text = match.replace(/<[^>]*>/g, "").trim();
              if (text && !textParts.includes(text)) {
                textParts.push(text);
              }
            }
          }
        }
      }
    }

    return textParts.join("\n\n");
  } catch {
    throw new Error("PPT 파일에서 텍스트를 추출할 수 없습니다.");
  }
}

/**
 * CSV 파일에서 텍스트 추출
 */
async function extractTextFromCSV(buffer: Buffer): Promise<string> {
  try {
    // CSV는 텍스트 파일이므로 UTF-8로 디코딩
    const text = buffer.toString("utf-8");
    return text;
  } catch {
    throw new Error("CSV 파일에서 텍스트를 추출할 수 없습니다.");
  }
}

/**
 * 파일 형식에 따라 텍스트 추출
 */
async function extractTextFromFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  // PDF
  if (mimeType === "application/pdf" || extension === "pdf") {
    return await extractTextFromPDF(buffer);
  }

  // Word (.docx)
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    return await extractTextFromWord(buffer);
  }

  // Word (.doc) - mammoth는 docx만 지원하므로 에러 처리
  if (mimeType === "application/msword" || extension === "doc") {
    throw new Error(
      ".doc 형식은 지원되지 않습니다. .docx 형식으로 변환해주세요.",
    );
  }

  // PPT (.pptx)
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    extension === "pptx"
  ) {
    return await extractTextFromPPT(buffer);
  }

  // PPT (.ppt)
  if (mimeType === "application/vnd.ms-powerpoint" || extension === "ppt") {
    throw new Error(
      ".ppt 형식은 지원되지 않습니다. .pptx 형식으로 변환해주세요.",
    );
  }

  // CSV
  if (
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    extension === "csv"
  ) {
    return await extractTextFromCSV(buffer);
  }

  throw new Error(`지원되지 않는 파일 형식: ${mimeType || extension}`);
}

export async function POST(request: NextRequest) {
  let fileUrl: string | undefined;
  let fileName: string | undefined;
  let mimeType: string | undefined;
  let examId: string | undefined;

  try {
    // 인증 확인
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // 강사 권한 확인
    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Rate limiting
    const rl = await checkRateLimitAsync(`extract-text:${user.id}`, RATE_LIMITS.upload);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const body = await request.json();
    ({ fileUrl, fileName, mimeType, examId } = body);

    if (!fileUrl) {
      return errorJson("MISSING_FILE_URL", "fileUrl is required", 400);
    }
    // TypeScript narrowing helper (Vercel build strict mode)
    const fileUrlStr: string = fileUrl;

    // Supabase Storage에서 파일 다운로드
    // fileUrl에서 storage path 추출
    const urlParts = fileUrl.split("/");
    const storagePath = urlParts
      .slice(urlParts.indexOf("exam-materials") + 1)
      .join("/");

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("exam-materials")
      .download(storagePath);

    if (downloadError || !fileData) {
      return errorJson("FILE_DOWNLOAD_FAILED", "파일을 다운로드할 수 없습니다.", 500);
    }

    // ArrayBuffer를 Buffer로 변환
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 텍스트 추출
    const extractedText = await extractTextFromFile(
      buffer,
      fileName || storagePath,
      mimeType || "",
    );

    // examId가 제공된 경우, 청킹 및 임베딩 생성 후 DB 저장
    let chunksSaved = 0;

    if (examId && extractedText.trim().length > 0) {
      try {
        // 1. 텍스트 청킹
        const chunks = chunkText(extractedText, {
          chunkSize: 800,
          chunkOverlap: 200,
        });

        if (chunks.length > 0) {
          // 2. 기존 청크 삭제 (파일 재처리 시)
          await deleteChunksByFileUrl(examId, fileUrlStr);

          // 3. 청크 포맷팅
          const formattedChunks = chunks.map((chunk) =>
            formatChunkMetadata(chunk, fileName || "unknown", fileUrlStr),
          );

          // 4. 임베딩 생성 (배치)
          const chunkTexts = formattedChunks.map((c) => c.content);
          const embeddings = await createEmbeddings(chunkTexts, {
            route: "/api/extract-text",
            userId: user.id,
            examId,
            metadata: {
              source: "extract_text_materials",
              file_url: fileUrlStr,
            },
          });

          // 5. DB에 저장
          const chunksToSave = formattedChunks.map((chunk, index) => ({
            content: chunk.content,
            embedding: embeddings[index],
            metadata: chunk.metadata,
          }));

          await saveChunksToDB(examId, chunksToSave);
          chunksSaved = chunksToSave.length;
        }
      } catch (embeddingError) {
        // 임베딩/저장 실패해도 텍스트 추출은 성공으로 처리
        logError(
          "[extract-text] 임베딩/저장 실패 (텍스트 추출은 성공)",
          embeddingError,
          { path: "/api/extract-text" }
        );
      }
    }

    const responseData = {
      text: extractedText,
      length: extractedText.length,
      chunksSaved: examId ? chunksSaved : undefined,
      note: examId
        ? undefined
        : "시험 생성 시 자동으로 청킹 및 임베딩이 처리됩니다.",
    };

    return successJson(responseData);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : undefined;

    // 항상 JSON 응답 반환 (빈 응답 방지)
    try {
      return errorJson(
        "EXTRACT_TEXT_FAILED",
        errorMessage || "알 수 없는 오류가 발생했습니다.",
        500,
        process.env.NODE_ENV === "development"
          ? { stack: errorStack, name: errorName }
          : undefined
      );
    } catch {
      // JSON 응답 생성 실패 시에도 에러 반환
      return new NextResponse(
        JSON.stringify({
          error: errorMessage || "알 수 없는 오류가 발생했습니다.",
          message: errorMessage || "알 수 없는 오류가 발생했습니다.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }
}
