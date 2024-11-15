"use client";

import { ReactNode, useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import GMDashboard from "@/components/MJcombat";
import Component from "@/components/fiche";
import MedievalNotes from "@/components/Notes";
import DiceRollerDnD from "@/components/campagne";
import Competences from "@/components/competences";
import OverlayComponent from "@/components/overlay";
import InfoComponent from "@/components/info";
import RollRequest from '@/components/Rollrequest';
import { Button } from "@/components/ui/button";

import { auth, db, getDoc, doc, onAuthStateChanged, collection, onSnapshot } from "@/lib/firebase";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const [activeTab, setActiveTab] = useState<string>("");
  const [isMJ, setIsMJ] = useState(false);
  const [showRollRequest, setShowRollRequest] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const uid = user.uid;
        const userDocRef = doc(db, `users/${uid}`);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setIsMJ(userData.perso === "MJ");
          setRoomId(userData.room_id);
        }
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!roomId) return;

    const requestsRef = collection(db, `Rollsrequests/${roomId}/requete`);

    const unsubscribe = onSnapshot(requestsRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const data = change.doc.data();
          if (data.isRequesting && !data.isCompleted) {
            setShowRollRequest(true);
          }
        }
      });
    });

    return () => unsubscribe();
  }, [roomId]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case "GMDashboard":
        return <GMDashboard />;
      case "Component":
        return <Component />;
      case "NewComponent":
        return <MedievalNotes />;
      case "DiceRollerDnD":
        return <DiceRollerDnD />;
      case "Competences":
        return <Competences />;
      case "infoComponent":
        return <InfoComponent />;
      default:
        return null;
    }
  };

  const handleIconClick = (tabName: string) => {
    setActiveTab(activeTab === tabName ? "" : tabName);
  };

  const getPanelWidth = () => {
    switch (activeTab) {
      case "Competences":
        return "w-[1200px]";
        case "GMDashboard":
          return " bg-white";
      case "DiceRollerDnD":
        return "w-[500px]"; // Optional: Customize for Music tab
      default:
        return "w-[700px]";
    }
  };

  return (
    <div className="relative h-screen bg-[#1c1c1c] text-[#d4d4d4] flex">
      <Sidebar activeTab={activeTab} handleIconClick={handleIconClick} isMJ={isMJ} />

      <div className="absolute left-0 z-10">
        <OverlayComponent />
      </div>

      {activeTab && (
        <aside
          className={`fixed left-20 top-0 h-full ${getPanelWidth()} bg-[#242424] text-black shadow-lg overflow-y-auto transition-transform duration-300 ease-in-out z-20`}
        >
          {renderActiveTab()}
        </aside>
      )}

      <main className="flex-1 h-full flex justify-center items-center bg-[#1c1c1c]">
        <div className="w-full h-full">{children}</div>
      </main>

      {showRollRequest && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50">
          <div className="rounded text-black w-1/3  text-center">
            <RollRequest />
            <Button
              onClick={() => setShowRollRequest(false)}
              className="mt-4 items-center justify-center "
              variant="default"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
