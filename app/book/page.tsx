"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { SignedOutRedirect } from "@/components/signed-out-redirect";
import { TripEditor } from "@/components/trip-editor";

export default function Book() {
  return (
    <main>
      <AuthLoading><div className="center-message">Opening your private book…</div></AuthLoading>
      <Unauthenticated><SignedOutRedirect returnTo="/book" /></Unauthenticated>
      <Authenticated><TripEditor /></Authenticated>
    </main>
  );
}
