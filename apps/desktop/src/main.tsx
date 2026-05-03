import "./styles/globals.css";
import "./App.css";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./app";
import { queryClient } from "./lib/query";
import {
  authGateLoader,
  guestOnlyLoader,
  onboardingLoader,
  rootIndexLoader,
} from "./routes/_guard";
import { AddClientPage } from "./routes/clients/add";
import { DashboardPage } from "./routes/dashboard";
import { LoginPage } from "./routes/login";
import { MeetingPage } from "./routes/meeting/$session-id";
import { JoinMeetingPage } from "./routes/meetings/join";
import { StartMeetingPage } from "./routes/meetings/start";
import { OnboardingHomePage } from "./routes/onboarding";
import { OnboardingCreateOrgPage } from "./routes/onboarding/create-org";
import { OnboardingJoinOrgPage } from "./routes/onboarding/join-org";
import { RegisterPage } from "./routes/register";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        loader: rootIndexLoader,
      },
      {
        path: "login",
        loader: guestOnlyLoader,
        element: <LoginPage />,
      },
      {
        path: "register",
        loader: guestOnlyLoader,
        element: <RegisterPage />,
      },
      {
        path: "onboarding",
        loader: onboardingLoader,
        children: [
          {
            index: true,
            element: <OnboardingHomePage />,
          },
          {
            path: "create-org",
            element: <OnboardingCreateOrgPage />,
          },
          {
            path: "join-org",
            element: <OnboardingJoinOrgPage />,
          },
        ],
      },
      {
        path: "dashboard",
        loader: authGateLoader,
        element: <DashboardPage />,
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
        path: "meeting/:sessionId",
        loader: authGateLoader,
        element: <MeetingPage />,
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
