# Quest-On MVP - Exam Platform Setup Guide

## 🚀 Getting Started

### 1. Environment Variables

Create a `.env.local` file in your project root with the following variables:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
CLERK_SECRET_KEY=sk_test_your_secret_key_here

# Clerk URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here
```

### 2. Clerk Setup

1. Go to [clerk.com](https://clerk.com) and create an account
2. Create a new application
3. Copy your publishable key and secret key
4. Update the environment variables above
5. Configure your Clerk application settings:
   - Set sign-in URL: `/sign-in`
   - Set sign-up URL: `/sign-up`
   - Set after sign-in URL: `/`
   - Set after sign-up URL: `/onboarding`

### 3. Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a project
2. Get your project URL and anon key
3. Create a service role key for server-side operations
4. Set up the following tables (SQL provided below)

### 4. OpenAI Setup

1. Go to [platform.openai.com](https://platform.openai.com) and get an API key
2. Add the key to your environment variables

## 🏗️ Architecture

### Role-Based System

- **Instructors**: Create and manage exams, view student progress
- **Students**: Take exams, receive AI feedback, view performance

### File Structure

```
app/
├── (auth)/                    # Authentication routes
│   ├── sign-in/              # Sign-in page
│   └── sign-up/              # Sign-up page
├── instructor/                # Instructor dashboard
│   ├── page.tsx              # Exam list and management
│   ├── new/page.tsx          # Create new exam
│   └── [examId]/page.tsx     # Exam detail and student progress
├── student/                   # Student dashboard
│   └── page.tsx              # Exam history and performance
├── exam/                      # Exam taking interface
│   ├── [code]/page.tsx       # Exam questions and chat
│   └── [code]/answer/page.tsx # Answer submission
├── join/                      # Exam code entry
├── onboarding/                # Role selection
└── page.tsx                   # Landing page

api/
├── chat/route.ts              # Clarification chat (LLM)
├── feedback/route.ts          # Exam feedback (LLM)
└── supa/route.ts              # Supabase operations

components/
├── ui/                        # shadcn/ui components
└── auth/                      # Authentication components

lib/
└── auth.ts                    # Authentication utilities
```

## 🔐 Authentication Flow

1. **New User**: Signs up → Selects role → Gets redirected to appropriate dashboard
2. **Returning User**: Signs in → Automatically redirected to role-specific dashboard
3. **Route Protection**: Proxy protects all routes except specified public ones

## 📚 Exam System Features

### For Instructors:

- **Create Exams**: Build exams with multiple question types
- **Manage Questions**: Add, edit, and organize exam questions
- **Monitor Progress**: Track student participation and completion
- **Generate Codes**: Unique exam codes for student access
- **View Analytics**: Student performance and submission data

### For Students:

- **Enter Exams**: Use exam codes to access tests
- **Take Exams**: Interactive interface with question navigation
- **Ask Questions**: Real-time clarification chat with AI
- **Submit Answers**: Comprehensive answer submission
- **Receive Feedback**: AI-powered feedback and analysis
- **Track Progress**: View exam history and performance

## 🎨 UI Components

Built with shadcn/ui components:

- Button, Card, Input, Textarea
- Badge, Sheet, Dialog, Table
- Dropdown Menu, Select, Label
- Radio Group, Sonner (toasts)

## 🗄️ Database Schema

### Tables to create in Supabase:

```sql
-- Exams table
CREATE TABLE exams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL,
  questions JSONB NOT NULL,
  status TEXT DEFAULT 'draft',
  instructor_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exam submissions table
CREATE TABLE exam_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES exams(id),
  student_id UUID REFERENCES auth.users(id),
  answers JSONB NOT NULL,
  feedback TEXT,
  score INTEGER,
  status TEXT DEFAULT 'submitted',
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Chat interactions table
CREATE TABLE chat_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES exams(id),
  student_id UUID REFERENCES auth.users(id),
  question_id TEXT,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🚧 Next Steps

1. Set up all environment variables
2. Create Supabase project and tables
3. Test authentication flow
4. Create your first exam
5. Test student exam flow
6. Customize UI and features
7. Add more question types
8. Implement advanced analytics

## 🐛 Troubleshooting

- **Build Errors**: Ensure all environment variables are set
- **Authentication Issues**: Check Clerk configuration and keys
- **API Errors**: Verify OpenAI and Supabase keys
- **Database Issues**: Check Supabase table structure and permissions
- **TypeScript Errors**: Run `npm run build` to check for type issues

## 🚀 Running the Application

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 📱 Features Ready

- ✅ **Complete Authentication System** with Clerk
- ✅ **Role-Based Access Control** (Instructor/Student)
- ✅ **Exam Creation & Management** for instructors
- ✅ **Interactive Exam Interface** for students
- ✅ **AI-Powered Chat** for clarification questions
- ✅ **AI Feedback System** for submitted answers
- ✅ **Responsive UI** with shadcn/ui components
- ✅ **API Routes** for chat, feedback, and database operations
- ✅ **TypeScript Support** throughout the application

Your exam platform is now ready to use! 🎉
