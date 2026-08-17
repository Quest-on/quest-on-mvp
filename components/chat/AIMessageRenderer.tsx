"use client";

import { useTranslations } from "next-intl";
import React from "react";
import ReactMarkdown, { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import type { SyntaxHighlighterProps } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  containsMathSyntax,
  normalizeMathDelimiters,
} from "@/lib/math-formatting";
import { CopyMessageButton } from "@/components/chat/CopyMessageButton";

interface AIMessageRendererProps {
  content: string;
  timestamp: string;
  variant?: "bubble" | "plain";
}

const AIMessageRenderer: React.FC<AIMessageRendererProps> = ({
  content,
  timestamp,
  variant = "bubble",
}) => {
  const t = useTranslations("assignment");
  const isPlain = variant === "plain";
  const normalizedContent = normalizeMathDelimiters(content);
  const hasMathSyntax = containsMathSyntax(content);
  return (
    <div
      className={
        isPlain
          ? "text-foreground w-full group relative"
          : "group bg-muted/90 text-foreground border border-border/60 backdrop-blur-sm rounded-3xl rounded-tl-md px-4 py-3 w-full shadow-lg shadow-muted/20 transition-all duration-200 hover:shadow-xl hover:shadow-muted/30"
      }
    >
      <div
        className={
          isPlain
            ? "prose prose-sm max-w-none dark:prose-invert break-words [&_*]:break-words [&_*]:leading-[1.5] [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1"
            : "prose prose-sm max-w-none dark:prose-invert prose-headings:mb-0 prose-p:mb-0 prose-p:last:mb-0 prose-ul:mb-0 prose-ol:mb-0 prose-li:mb-0 break-words [&_*]:break-words [&_*]:leading-[1.3] [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1 [&_.katex-display]:max-w-full [&_.katex]:text-[0.95em]"
        }
      >
        {/* 항상 마크다운으로 렌더링 */}
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[
            [
              rehypeKatex,
              {
                throwOnError: false,
                errorColor: "#cc0000",
                displayMode: false, // 기본적으로 인라인 모드
                fleqn: false, // 왼쪽 정렬 사용 안 함
                output: "html", // MathML 대신 HTML만 출력하도록 설정
                macros: {
                  "\\RR": "\\mathbb{R}",
                  "\\NN": "\\mathbb{N}",
                  "\\ZZ": "\\mathbb{Z}",
                  "\\QQ": "\\mathbb{Q}",
                  "\\CC": "\\mathbb{C}",
                },
              },
            ],
          ]}
          components={
            {
              // 헤더 스타일링
              h1: ({ children }: React.ComponentProps<"h1">) => (
                <h1 className="text-xl font-bold text-foreground mb-0 mt-1 first:mt-0 border-b pb-0.5 [&+*]:mt-0">
                  {children}
                </h1>
              ),
              h2: ({ children }: React.ComponentProps<"h2">) => (
                <h2 className="text-lg font-bold text-foreground mb-0 mt-1 [&+*]:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }: React.ComponentProps<"h3">) => (
                <h3 className="text-base font-semibold text-foreground mb-0 mt-0.5 [&+*]:mt-0">
                  {children}
                </h3>
              ),

              // 문단 스타일링
              p: ({ children }: React.ComponentProps<"p">) => (
                <p className="text-sm leading-[1.3] mb-0 mt-0 last:mb-0 text-foreground/90 [&+*]:mt-0">
                  {children}
                </p>
              ),

              // 코드 블록 스타일링
              code: ({
                node,
                className,
                children,
                ...props
              }: React.ComponentProps<"code"> & { node?: Element }) => {
                const match = /language-(\w+)/.exec(className || "");
                const isInline = !match || (node && node.tagName !== "PRE");
                return !isInline && match ? (
                  <div className="my-0 mt-0 mb-0 rounded-lg overflow-hidden shadow-sm border border-border/50 [&+*]:mt-0">
                    <div className="bg-muted/50 px-4 py-1 text-xs font-mono text-muted-foreground border-b border-border/50 flex justify-between">
                      <span>{match[1]}</span>
                    </div>
                    <SyntaxHighlighter
                      style={vscDarkPlus as SyntaxHighlighterProps["style"]}
                      language={match[1]}
                      PreTag="div"
                      className="!m-0 !rounded-none !bg-[#1e1e1e]"
                      showLineNumbers={true}
                      {...(props as Omit<SyntaxHighlighterProps, "children" | "style" | "language">)}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <code
                    className="bg-muted text-primary px-1 py-0 rounded-md text-xs font-mono border border-border/50"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },

              // 테이블 스타일링
              table: ({ children }: React.ComponentProps<"table">) => (
                <div className="overflow-x-auto my-0 mt-0 mb-0 border border-border/50 rounded-lg shadow-sm bg-background [&+*]:mt-0">
                  <table className="min-w-full divide-y divide-border">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }: React.ComponentProps<"thead">) => (
                <thead className="bg-primary/10 dark:bg-primary/20 border-b-2 border-primary/20">
                  {children}
                </thead>
              ),
              tbody: ({ children }: React.ComponentProps<"tbody">) => (
                <tbody className="divide-y divide-border/50 bg-background">
                  {children}
                </tbody>
              ),
              tr: ({ children }: React.ComponentProps<"tr">) => (
                <tr className="transition-colors hover:bg-muted/40 border-b border-border/30 last:border-b-0">
                  {children}
                </tr>
              ),
              th: ({ children }: React.ComponentProps<"th">) => (
                <th className="px-4 py-3 text-left text-sm font-bold text-foreground">
                  {children}
                </th>
              ),
              td: ({ children }: React.ComponentProps<"td">) => (
                <td className="px-4 py-3 text-sm text-foreground/90 whitespace-normal break-words">
                  {children}
                </td>
              ),

              // 리스트 스타일링
              ul: ({ children }: React.ComponentProps<"ul">) => (
                <ul className="list-disc list-outside ml-5 mb-0 mt-0 space-y-0 marker:text-muted-foreground [&>li]:mb-0 [&>li]:mt-0 [&>li]:first:mt-0 [&>li+li]:mt-0 [&>li]:last:mb-0 [&+*]:mt-0 [&_p]:mb-0 [&_p]:mt-0 [&_p]:leading-[1.3] [&_p]:first:mt-0 [&_p]:last:mb-0 [&_ul]:mb-0 [&_ul]:mt-0 [&_ul]:last:mb-0 [&_ol]:mb-0 [&_ol]:mt-0 [&_ol]:last:mb-0">
                  {children}
                </ul>
              ),
              ol: ({ children }: React.ComponentProps<"ol">) => (
                <ol className="list-decimal list-outside ml-5 mb-0 mt-0 space-y-0 marker:text-muted-foreground marker:font-medium [&>li]:mb-0 [&>li]:mt-0 [&>li]:first:mt-0 [&>li+li]:mt-0 [&>li]:last:mb-0 [&+*]:mt-0 [&_p]:mb-0 [&_p]:mt-0 [&_p]:leading-[1.3] [&_p]:first:mt-0 [&_p]:last:mb-0 [&_ul]:mb-0 [&_ul]:mt-0 [&_ul]:last:mb-0 [&_ol]:mb-0 [&_ol]:mt-0 [&_ol]:last:mb-0">
                  {children}
                </ol>
              ),
              li: ({ children }: React.ComponentProps<"li">) => (
                <li className="text-sm leading-[1.3] pl-1 mb-0 mt-0 first:mt-0 [&+li]:mt-0 [&>*]:last:mb-0 [&>p]:mb-0 [&>p]:mt-0 [&>p]:first:mt-0 [&>p]:last:mb-0 [&>p]:leading-[1.3] [&>ul]:mb-0 [&>ul]:mt-0 [&>ul]:first:mt-0 [&>ul]:last:mb-0 [&>ol]:mb-0 [&>ol]:mt-0 [&>ol]:first:mt-0 [&>ol]:last:mb-0 [&_p]:mb-0 [&_p]:mt-0 [&_p]:first:mt-0 [&_p]:last:mb-0 [&_p]:leading-[1.3] [&_ul]:mb-0 [&_ul]:mt-0 [&_ul]:last:mb-0 [&_ol]:mb-0 [&_ol]:mt-0 [&_ol]:last:mb-0">
                  {children}
                </li>
              ),

              // 강조 스타일링
              strong: ({ children }: React.ComponentProps<"strong">) => (
                <strong className="font-bold text-primary/90">
                  {children}
                </strong>
              ),
              em: ({ children }: React.ComponentProps<"em">) => (
                <em className="italic text-muted-foreground">{children}</em>
              ),

              // 링크 스타일링
              a: ({ children, href }: React.ComponentProps<"a">) => (
                <a
                  href={href}
                  className="text-blue-500 hover:text-blue-600 hover:underline transition-colors font-medium"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),

              // 인용구 스타일링
              blockquote: ({
                children,
              }: React.ComponentProps<"blockquote">) => (
                <blockquote className="border-l-4 border-primary/30 pl-2 py-0 bg-muted/30 rounded-r-lg italic text-muted-foreground my-0 mt-0 mb-0 [&+*]:mt-0 shadow-sm">
                  {children}
                </blockquote>
              ),

              // 수학 식 렌더링 (remark-math 플러그인용)
              math: ({ children }: { children?: React.ReactNode }) => (
                <div className="my-0 mt-0 mb-0 overflow-x-auto p-0.5 bg-muted/20 rounded-lg text-center [&+*]:mt-0">
                  {children}
                </div>
              ),
              inlineMath: ({ children }: { children?: React.ReactNode }) => (
                <span className="inline-block mx-1 px-1 bg-muted/20 rounded">
                  {children}
                </span>
              ),

              // 수평선
              hr: (): React.ReactElement => (
                <hr className="border-border !mt-3 mb-3" />
              ),

              // 취소선 스타일링 (물결표 오작동 방지)
              del: ({ children }: React.ComponentProps<"del">) => (
                <span className="no-underline decoration-0">{children}</span>
              ),
            } as Components
          }
        >
          {normalizedContent}
        </ReactMarkdown>
      </div>

      {isPlain && (
        <div className="mt-2 flex justify-end">
          <CopyMessageButton
            text={content}
            className="opacity-60 sm:opacity-60 sm:group-hover:opacity-100"
          />
        </div>
      )}

      {!isPlain && (
        <>
          <div className="mt-4 pt-3 border-t border-border/30 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
              <span className="text-xs font-medium text-muted-foreground">
                {t("chat.aiAnswer")}
              </span>
              <CopyMessageButton text={content} />
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              {new Date(timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          {hasMathSyntax && (
            <div className="mt-1 text-[10px] text-muted-foreground/70 text-right">
              {t("chat.latexBadge")}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AIMessageRenderer;
