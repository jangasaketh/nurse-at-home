"use client";

import { AppProvider, TAB_SCREENS, useApp } from "@/lib/store";
import { LoginScreen, OtpScreen } from "@/components/AuthScreens";
import { HomeScreen } from "@/components/HomeScreen";
import {
  CaregiverListScreen,
  CaregiverProfileScreen,
  ReviewScreen,
  ScheduleScreen,
  ServiceScreen,
} from "@/components/BookingScreens";
import { DoneScreen, TrackingScreen } from "@/components/VisitScreens";
import { BookingsScreen, ProfileScreen, RecordsScreen, TabBar } from "@/components/TabScreens";

function CurrentScreen() {
  const { state } = useApp();
  switch (state.screen) {
    case "login":
      return <LoginScreen />;
    case "otp":
      return <OtpScreen />;
    case "home":
      return <HomeScreen />;
    case "service":
      return <ServiceScreen />;
    case "schedule":
      return <ScheduleScreen />;
    case "caregivers":
      return <CaregiverListScreen />;
    case "caregiver":
      return <CaregiverProfileScreen />;
    case "review":
      return <ReviewScreen />;
    case "tracking":
      return <TrackingScreen />;
    case "done":
      return <DoneScreen />;
    case "bookings":
      return <BookingsScreen />;
    case "records":
      return <RecordsScreen />;
    case "profile":
      return <ProfileScreen />;
  }
}

function Shell() {
  const { state } = useApp();
  return (
    <main className="app">
      <CurrentScreen />
      {TAB_SCREENS.includes(state.screen) && <TabBar />}
    </main>
  );
}

export default function Page() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
