import "./styles/globals.css";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./app";
import { AppErrorBoundary } from "./components/app-error-boundary";
import { RouteErrorBoundary } from "./components/route-error-boundary";
import { ThemeProvider } from "./components/theme-provider";
import { LoginPage } from "./features/auth/login-page";
import { RegisterPage } from "./features/auth/register-page";
import { WelcomePage } from "./features/auth/welcome-page";
import { AddClientPage } from "./features/clients/add-page";
import { ClientsPage } from "./features/clients/clients-page";
import { ClientDetailPage } from "./features/clients/detail-page";
import { HomePage } from "./features/home/home-page";
import { MeetingPage } from "./features/meetings/live/meeting-page";
import { MeetingPostPage } from "./features/meetings/review/meeting-post-page";
import { MeetingBriefPage } from "./features/meetings/setup/brief-page";
import { JoinMeetingPage } from "./features/meetings/setup/join-page";
import { StartMeetingPage } from "./features/meetings/setup/start-page";
import { WaitingRoomPage } from "./features/meetings/setup/waiting-room-page";
import { OnboardingPage } from "./features/onboarding/onboarding-page";
import { SettingsPage } from "./features/settings/settings-page";
import { initAuthDeepLink } from "./lib/auth-deeplink";
import { queryClient } from "./lib/query";
import {
  authGateLoader,
  guestOnlyLoader,
  onboardingLoader,
  rootIndexLoader,
} from "./routes/_guard";
import { OverlayPage } from "./routes/overlay";
import { AuthGuardSkeleton } from "./routes/shared";

const router = createBrowserRouter([
  {
    path: "/overlay",
    element: <OverlayPage />,
  },
  {
    path: "/welcome",
    loader: guestOnlyLoader,
    element: <WelcomePage />,
  },
  {
    path: "/login",
    loader: guestOnlyLoader,
    element: <LoginPage />,
  },
  {
    path: "/register",
    loader: guestOnlyLoader,
    element: <RegisterPage />,
  },
  {
    path: "/onboarding",
    loader: onboardingLoader,
    element: <OnboardingPage />,
  },
  {
    path: "/",
    element: <App />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        loader: rootIndexLoader,
        element: <React.Fragment />,
      },
      {
        path: "home",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <HomePage />
          </AuthGuardSkeleton>
        ),
      },
      {
        path: "clients",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <ClientsPage />
          </AuthGuardSkeleton>
        ),
      },
      {
        path: "clients/:clientId",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <ClientDetailPage />
          </AuthGuardSkeleton>
        ),
      },
      {
        path: "clients/add",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <AddClientPage />
          </AuthGuardSkeleton>
        ),
      },
      {
        path: "meetings/start",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <StartMeetingPage />
          </AuthGuardSkeleton>
        ),
      },
      {
        path: "meetings/join",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <JoinMeetingPage />
          </AuthGuardSkeleton>
        ),
      },
      {
        path: "meeting/:sessionId/waiting-room",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <WaitingRoomPage />
          </AuthGuardSkeleton>
        ),
      },
      {
        path: "meetings/:meetingId/brief",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <MeetingBriefPage />
          </AuthGuardSkeleton>
        ),
      },
      {
        path: "meeting/:sessionId",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <MeetingPage />
          </AuthGuardSkeleton>
        ),
      },
      {
        path: "meeting-post/:meetingId",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <MeetingPostPage />
          </AuthGuardSkeleton>
        ),
      },
      {
        path: "settings",
        loader: authGateLoader,
        element: (
          <AuthGuardSkeleton>
            <SettingsPage />
          </AuthGuardSkeleton>
        ),
      },
    ],
  },
]);

initAuthDeepLink();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
