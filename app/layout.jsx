export const metadata = { title: "NCI" };
export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body style={{background:"#fff"}}>{children}</body>
    </html>
  );
}
