# Scribely Frontend

A FastAPI + Next.js AI agent application with OpenRouter

A clean, modern Next.js frontend for the FastAPI backend with health monitoring and status dashboard.

## 🚀 Features

### Core Features
- **📊 Health Dashboard**: Real-time backend health status monitoring
- **🔐 Clerk Authentication**: Ready for Clerk integration (optional)
- **🎨 Modern UI**: Beautiful gradient design with dark theme
- **⚡ Fast Performance**: Optimized with Next.js 14+ App Router
- **📱 Responsive Design**: Works on all devices
- **🔄 Real-time Updates**: Auto-refreshing health status

### Technical Features
- **📦 TypeScript**: Full type safety
- **🎯 Component Library**: Reusable UI components
- **🔧 API Client**: Simple, clean API integration
- **🛡️ Error Handling**: Graceful error recovery
- **🎯 Performance Optimized**: Code splitting and caching

## 🏗️ Architecture

### Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page with health dashboard
│   └── api/               # API routes
│       └── health/        # Health check proxy
│
├── components/            # Reusable UI components
│   ├── ui/               # Base UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   └── ...
│   ├── layout/           # Layout components
│   └── providers/        # Context providers
│       ├── theme-provider.tsx
│       └── toast-provider.tsx
│
├── lib/                  # Utilities and configurations
│   ├── api.ts           # Backend API client
│   └── utils.ts         # Helper functions
│
└── types/               # TypeScript type definitions
```

## 🚦 Quick Start

### Prerequisites

- **Node.js**: 18.0+
- **npm/yarn/pnpm**: Latest version
- **Backend API**: Scribely Backend running on port 8000

### 1. Installation

```bash
# Install dependencies
npm install
# or
yarn install
# or
pnpm install
```

### 2. Environment Setup

Create a `.env.local` file:

```bash
# Backend API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000

# Clerk Authentication (optional)
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your-clerk-publishable-key-here

# App Configuration
NEXT_PUBLIC_APP_NAME=Scribely
NEXT_PUBLIC_APP_VERSION=0.1.0
```

### 3. Development Server

```bash
# Start development server
npm run dev
# or
yarn dev
# or
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your application.

### 4. Backend Connection

Make sure your backend is running:

```bash
# In backend directory
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The frontend will automatically connect to your backend API and display health status.

## 📡 API Integration

### Backend Endpoints

The frontend integrates with these backend endpoints:

```typescript
// Health & Status
GET  /api/v1/health/            // Health check
GET  /api/v1/metrics/           // Metrics
GET  /                          // API info
```

### API Client Usage

```typescript
import { apiClient } from "@/lib/api";

// Health check
const health = await apiClient.healthCheck();

// Get API info
const info = await apiClient.getRoot();

// Get metrics
const metrics = await apiClient.getMetrics();
```

## 🎨 Styling & Theming

### Design System

The application uses a modern dark theme with gradient backgrounds:

**Colors**:
- Primary: Purple/Blue gradient
- Background: Dark gray gradient (gray-950 → blue-950 → purple-950)
- Accent: Purple, Pink, Blue gradients

**Typography**:
- Font Family: Inter (system fallback)
- Scale: Responsive text sizing

### Dark Theme

Built-in dark mode with system preference detection:

```typescript
// Automatic theme detection
const { theme, setTheme } = useTheme()

// Manual theme switching
<button onClick={() => setTheme('dark')}>
  Switch to Dark Mode
</button>
```

## 🧪 Development

### Available Scripts

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Type checking
npm run type-check

# Linting
npm run lint
```

### Code Quality

**TypeScript Strict Mode**:
- Full type safety
- No implicit any
- Strict null checks

**ESLint Configuration**:
- Next.js recommended rules
- TypeScript rules
- React best practices

## 🐳 Docker Support

### Development with Docker

```dockerfile
# Dockerfile included in project
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
```

```bash
# Build and run
docker build -t scribely-frontend .
docker run -p 3000:3000 scribely-frontend
```

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
NEXT_PUBLIC_API_URL=https://your-backend-api.com
```

### Netlify

```bash
# Build command
npm run build

# Publish directory
out

# Environment variables
NEXT_PUBLIC_API_URL=https://your-backend-api.com
```

### Self-Hosted

```bash
# Build for production
npm run build

# Start production server
npm run start
```

### Environment Variables for Production

**Required**:

```bash
# Backend API
NEXT_PUBLIC_API_URL=https://your-backend-api.com
```

**Optional**:

```bash
# Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_your-clerk-publishable-key

# App Configuration
NEXT_PUBLIC_APP_NAME="Your App Name"
NEXT_PUBLIC_APP_VERSION="1.0.0"
```

## 🔧 Customization

### Adding New Components

```typescript
// src/components/ui/new-component.tsx
import { cn } from '@/lib/utils'

interface NewComponentProps {
  className?: string
  children: React.ReactNode
}

export function NewComponent({ className, children }: NewComponentProps) {
  return (
    <div className={cn('base-styles', className)}>
      {children}
    </div>
  )
}
```

### Custom Hooks

```typescript
// src/hooks/use-custom-hook.ts
import { useState, useEffect } from "react";

export function useCustomHook() {
  const [state, setState] = useState(null);

  useEffect(() => {
    // Custom logic
  }, []);

  return { state, setState };
}
```

## 🐛 Troubleshooting

### Common Issues

**Backend Connection Issues**:

```bash
# Check if backend is running
curl http://localhost:8000/api/v1/health/

# Verify environment variables
echo $NEXT_PUBLIC_API_URL
```

**Build Errors**:

```bash
# Clear Next.js cache
rm -rf .next

# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**TypeScript Errors**:

```bash
# Run type checking
npm run type-check

# Generate type definitions
npm run build
```

### Debug Mode

```bash
# Enable debug logging
NEXT_PUBLIC_DEBUG=true npm run dev

# Check browser console for detailed logs
# Network tab shows API calls and responses
```

## 🔐 Security

### Best Practices

- **Environment Variables**: Never expose secrets in client code
- **API Security**: Validate all inputs, sanitize outputs
- **XSS Protection**: Use React's built-in XSS protection
- **Content Security Policy**: Configure CSP headers
- **HTTPS Only**: Always use HTTPS in production

## 📊 Performance

### Core Web Vitals

The application is optimized for:

- **Largest Contentful Paint (LCP)**: < 2.5s
- **First Input Delay (FID)**: < 100ms
- **Cumulative Layout Shift (CLS)**: < 0.1

### Optimization Features

- **Code Splitting**: Automatic route-based splitting
- **Image Optimization**: Next.js Image component
- **Font Optimization**: Automatic font loading
- **Caching**: Static asset caching with CDN support

## 📚 Additional Resources

- **Next.js Documentation**: https://nextjs.org/docs
- **TypeScript Documentation**: https://www.typescriptlang.org/docs
- **Backend API**: See backend README for API documentation

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Built with ❤️ using [Next.js](https://nextjs.org/) and [TypeScript](https://www.typescriptlang.org/)**

**Generated by [cookiecutter-fastapi-nextjs-llm](https://github.com/your-org/cookiecutter-fastapi-nextjs-llm)**
