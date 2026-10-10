"use client";

import { useEffect, useState } from "react";
import { AppProvider, TAB_SCREENS, useApp } from "@/lib/store";
import { LoginScreen, OtpScreen, SetupScreen } from "@/components/AuthScreens";
import { HomeScreen } from "@/components/HomeScreen";
import {
  CaregiverListScreen,
  CaregiverProfileScreen,
  ReviewScreen,
  ScheduleScreen,
  ServiceScreen,
} from "@/components/BookingScreens";
import { DoneScreen, TrackingScreen } from "@/components/VisitScreens";
import { CancelScreen, RescheduleScreen } from "@/components/ManageBookingScreens";
import { BookingsScreen, ProfileScreen, RecordsScreen, TabBar } from "@/components/TabScreens";
import { AddressFormScreen, AddressesScreen, ContactFormScreen, FamilyFormScreen } from "@/components/AccountScreens";
import { HelpScreen, LegalScreen, NotificationsScreen } from "@/components/SupportScreens";
import { Icon } from "@/components/Icon";
import { t } from "@/lib/i18n";
import { registerServiceWorker } from "@/lib/install";

function CurrentScreen() {
  const { state } = useApp();
  switch (state.screen) {
    case "login": return <LoginScreen />;
    case "otp": return <OtpScreen />;
    case "setup": return <SetupScreen />;
    case "legal": return <LegalScreen />;
    case "home": return <HomeScreen />;
    case "service": return <ServiceScreen />;
    case "schedule": return <ScheduleScreen />;
    case "caregivers": return <CaregiverListScreen />;
    case "caregiver": return <CaregiverProfileScreen />;
    case "review": return <ReviewScreen />;
    case "tracking": return <TrackingScreen />;
    case "done": return <DoneScreen />;
    case "cancel": return <CancelScreen />;
    case "reschedule": return <RescheduleScreen />;
    case "bookings": return <BookingsScreen />;
    case "records": return <RecordsScreen />;
    case "profile": return <ProfileScreen />;
    // The key makes the form start fresh for each person or address.
    case "family": return <FamilyFormScreen key={state.editingId ?? "new"} />;
    case "addresses": return <AddressesScreen />;
    case "address": return <AddressFormScreen key={state.editingId ?? "new"} />;
    case "contact": return <ContactFormScreen />;
    case "notifications": return <NotificationsScreen />;
    case "help": return <HelpScreen />;
  }
}

/** A strip at the top whenever the phone or computer has no internet connection. */
function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline" role="status">
      <Icon name="offline" size={18} />
      {t("You are offline. Some things will not work until you reconnect.")}
    </div>
  );
}

function Shell() {
  const { state, ready } = useApp();

  // Shown for a moment while saved data is read.
  if (!ready) {
    return (
      <main className="app">
        <div className="splash" role="status" aria-label="Loading">
          <div className="logo"><Icon name="logo" size={24} /></div>
          <div className="brand">Nurse at Home</div>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <OfflineBanner />
      <CurrentScreen />
      {TAB_SCREENS.includes(state.screen) && <TabBar />}
    </main>
  );
}

export default function Page() {
  // Lets the installed app open without internet (see public/sw.js).
  useEffect(() => { registerServiceWorker(); }, []);
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
