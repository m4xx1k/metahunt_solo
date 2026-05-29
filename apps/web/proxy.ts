import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isOperatorRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/sources(.*)',
  '/vacancies(.*)',
  '/unique-vacancies(.*)',
  '/taxonomy(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isOperatorRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
