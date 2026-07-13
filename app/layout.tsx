import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const host = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(forwardedHost) ? forwardedHost : "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : host.startsWith("localhost") ? "http" : "https";
  const origin = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: origin,
    title: "PromptLab — System Prompt 迭代评估工作台",
    description: "用独立优化模型和评估模型，在自定义或 AI 测试集上迭代出可复用的 System Prompt。",
    openGraph: {
      title: "PromptLab — 优化 System Prompt，不把测试题写进答案",
      description: "分离模型角色与测试消息，透明迭代可复用的 System Prompt。",
      type: "website",
      url: origin,
      images: [{ url: socialImage, width: 1731, height: 909, alt: "PromptLab — 让提示词自己进化" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "PromptLab — 优化 System Prompt，不把测试题写进答案",
      description: "分离模型角色与测试消息，透明迭代可复用的 System Prompt。",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
