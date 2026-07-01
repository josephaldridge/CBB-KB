import "./globals.css";

export const metadata = {
  title: "Cowboy Academy | Knowledge Base",
  description: "Cowboy Bail Bonds operational playbook and reference.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
