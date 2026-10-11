"use client";

// CAREGIVER APP: chooses which screen to show. Served at /caregiver/ (see app/caregiver/page.tsx).

import { useEffect } from "react";
import { CaregiverProvider, CG_TABS, useCg, type CgScreen } from "@/lib/caregiver/store";
import { registerServiceWorker } from "@/lib/install";
import { t } from "@/lib/i18n";
import { Icon, type IconName } from "../Icon";
import { OfflineBanner } from "../OfflineBanner";
import {
  BankScreen, CgLoginScreen, CgOtpScreen, IdScreen, KycScreen, PersonalScreen, QualificationScreen, ReviewScreen, RoleScreen, SelfieScreen,
} from "./SignupScreens";
import { JobScreen, JobsScreen } from "./JobScreens";
import { CancelVisitScreen, RecordScreen, VisitDoneScreen, VisitScreen } from "./VisitScreens";
import { AvailabilityScreen, EarningsScreen, ScheduleScreen } from "./WorkScreens";
import { CgHelpScreen, CgLegalScreen, CgProfileScreen } from "./AccountScreens";

function CurrentScreen() {
  const { state } = useCg();
  switch (state.screen) {
    case "login": return <CgLoginScreen />;
    case "otp": return <CgOtpScreen />;
    case "role": return <RoleScreen />;
    case "kyc": return <KycScreen />;
    case "kyc-personal": return <PersonalScreen />;
    case "kyc-id": return <IdScreen />;
    case "kyc-selfie": return <SelfieScreen />;
    case "kyc-qualification": return <QualificationScreen />;
    case "kyc-bank": return <BankScreen />;
    case "review": return <ReviewScreen />;
    case "jobs": return <JobsScreen />;
    case "job": return <JobScreen key={state.openJobId ?? "none"} />;
    case "visit": return <VisitScreen />;
    case "record": return <RecordScreen />;
    case "visit-done": return <VisitDoneScreen />;
    case "cancel-visit": return <CancelVisitScreen />;
    case "schedule": return <ScheduleScreen />;
    case "availability": return <AvailabilityScreen />;
    case "earnings": return <EarningsScreen />;
    case "profile": return <CgProfileScreen />;
    case "help": return <CgHelpScreen />;
    case "legal": return <CgLegalScreen />;
  }
}

const TABS: { id: CgScreen; label: string; icon: IconName }[] = [
  { id: "jobs", label: "Jobs", icon: "home" },
  { id: "schedule", label: "Schedule", icon: "calendar" },
  { id: "earnings", label: "Earnings", icon: "wallet" },
  { id: "profile", label: "Profile", icon: "user" },
];

function CgTabBar() {
  const { state, go } = useCg();
  return (
    <nav className="tabbar" aria-label={t("Main")}>
      {TABS.map((tab) => (
        <button type="button" key={tab.id} className="tab" aria-current={state.screen === tab.id ? "page" : undefined} onClick={() => go(tab.id)}>
          <Icon name={tab.icon} size={24} />
          <span>{t(tab.label)}</span>
        </button>
      ))}
    </nav>
  );
}

function Shell() {
  const { state, ready } = useCg();
  if (!ready) {
    return (
      <main className="app cg">
        <div className="splash" role="status" aria-label="Loading">
          <div className="logo"><Icon name="bag" size={24} /></div>
          <div className="brand">Nurse at Home</div>
        </div>
      </main>
    );
  }
  // Tabs are only for verified caregivers.
  const showTabs = CG_TABS.includes(state.screen) && state.kycStatus === "approved";
  return (
    <main className="app cg">
      <OfflineBanner />
      <CurrentScreen />
      {showTabs && <CgTabBar />}
    </main>
  );
}

export function CaregiverApp() {
  useEffect(() => { registerServiceWorker(); }, []);
  return (
    <CaregiverProvider>
      <Shell />
    </CaregiverProvider>
  );
}
