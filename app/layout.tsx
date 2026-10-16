import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "아이디어 노트",
  description:
    "Gemini로 프로젝트 아이디어를 만들고, 마음에 드는 생각을 기기에 보관하세요.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
