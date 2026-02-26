import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import AuthProvider from "@/components/AuthProvider";
import { WebSocketProvider } from "@/contexts/WebSocketContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Estate Agent — AI Calling Dashboard",
  description: "AI-powered real estate calling agent dashboard for managing outbound calls, leads, and campaigns",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <WebSocketProvider>
            <div className="layout-container">
              <Sidebar />
              <div className="layout-body">
                <TopBar />
                <main>{children}</main>
              </div>
            </div>
          </WebSocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
