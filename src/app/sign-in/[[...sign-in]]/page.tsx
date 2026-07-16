import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
            Field Ops
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sign in to access your dashboard
          </p>
        </div>
        <SignIn />
      </div>
    </div>
  );
}
