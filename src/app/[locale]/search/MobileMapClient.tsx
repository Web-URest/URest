"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MapView, type MapPin } from "@/components/ui/MapView";

interface MobileMapClientProps {
  pins: MapPin[];
  centerLat: number;
  centerLng: number;
}

export function MobileMapClient({ pins, centerLat, centerLng }: MobileMapClientProps) {
  const t = useTranslations("Search");
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating pill */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-card"
        >
          🗺 {t("mapToggle")}
        </button>
      </div>

      {/* Full-screen map overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white md:hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-semibold text-ink-900">{t("mapToggle")}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold text-teal-600"
            >
              {t("mapClose")}
            </button>
          </div>
          <div className="flex-1">
            <MapView pins={pins} centerLat={centerLat} centerLng={centerLng} />
          </div>
        </div>
      )}
    </>
  );
}
