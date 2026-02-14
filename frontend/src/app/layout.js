import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "AI Calling Agent Dashboard",
  description: "Dashboard for AI Outbound Calling Agent",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="layout-container">
          <Sidebar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
