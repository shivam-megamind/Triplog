"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AuthForm } from "@/components/auth-form";
import { TripEditor } from "@/components/trip-editor";

export default function Book() {
  return (
    <main>
      <AuthLoading><div className="center-message">Opening your private book…</div></AuthLoading>
      <Unauthenticated><AuthForm /></Unauthenticated>
      <Authenticated><TripEditor /></Authenticated>
    </main>
  );
}
