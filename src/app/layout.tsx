import "./globals.css";
import { Inter } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs'

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "AI Portfolio Creator",
  description: "Build and explain your portfolio with the help of AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
            <body className={inter.className}>
        <ClerkProvider>
          <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] via-[#1a1f3a] to-[#0f172a]">
            {children}
          </div>
        </ClerkProvider>
      </body>
    </html>
  );
}