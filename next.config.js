/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // 讓 next build 不因 ESLint 錯誤而失敗
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
