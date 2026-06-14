import "./styles/globals.css";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./app";
import { AppErrorBoundary } from "./components/app-error-boundary";
import { RouteErrorBoundary } from "./components/route-error-boundary";
import { queryClient } from "./lib/query";
import {
  authGateLoader,
  guestOnlyLoader,
  onboardingLoader,
  rootIndexLoader,
} from "./routes/_guard";
import { AddClientPage } from "./routes/clients/add";
import { ClientDetailPage } from "./routes/clients/detail";
import { ClientsPage } from "./routes/clients/index";
import { HomePage } from "./routes/home";
import { LoginPage } from "./routes/login";
import { MeetingPage } from "./routes/meeting/$session-id";
import { WaitingRoomPage } from "./routes/meeting/waiting-room";
import { MeetingPostPage } from "./routes/meeting-post/$meeting-id";
import { JoinMeetingPage } from "./routes/meetings/join";
import { StartMeetingPage } from "./routes/meetings/start";
import { OnboardingPage } from "./routes/onboarding";
import { OverlayPage } from "./routes/overlay";
import { RegisterPage } from "./routes/register";
import { SettingsPage } from "./routes/settings";
import { WelcomePage } from "./routes/welcome";

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
      },
      {
        path: "home",
        loader: authGateLoader,
        element: <HomePage />,
      },
      {
        path: "clients",
        loader: authGateLoader,
        element: <ClientsPage />,
      },
      {
        path: "clients/:clientId",
        loader: authGateLoader,
        element: <ClientDetailPage />,
      },
      {
        path: "clients/add",
        loader: authGateLoader,
        element: <AddClientPage />,
      },
      {
        path: "meetings/start",
        loader: authGateLoader,
        element: <StartMeetingPage />,
      },
      {
        path: "meetings/join",
        loader: authGateLoader,
        element: <JoinMeetingPage />,
      },
      {
        path: "meeting/:sessionId/waiting-room",
        loader: authGateLoader,
        element: <WaitingRoomPage />,
      },
      {
        path: "meeting/:sessionId",
        loader: authGateLoader,
        element: <MeetingPage />,
      },
      {
        path: "meeting-post/:meetingId",
        loader: authGateLoader,
        element: <MeetingPostPage />,
      },
      {
        path: "settings",
        loader: authGateLoader,
        element: <SettingsPage />,
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
