import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.50.107:3002', '192.168.50.107', 'localhost:3002'],
};

export default withNextIntl(nextConfig);
