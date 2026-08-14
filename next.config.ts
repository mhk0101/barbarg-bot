import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  /* pdfkit و exceljs فایل‌های جانبی (مثل فونت‌های .afm) را از دیسک
     می‌خوانند. اگر باندل شوند، آن فایل‌ها کپی نمی‌شوند و هنگام
     اجرا خطای ENOENT: Helvetica.afm می‌دهند. */
  serverExternalPackages: ['pdfkit', 'exceljs', 'playwright'],
  
  // 👇 این خط را اضافه کنید
  allowedDevOrigins: ['aim-upfront-statue.ngrok-free.dev'],
};

export default nextConfig;