"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatSatang } from "@/lib/money";

// Minimal Maps SDK types — avoids requiring @types/google.maps as a dep.
interface GoogleMapsSDK {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => { setCenter: (c: { lat: number; lng: number }) => void };
    marker: {
      AdvancedMarkerElement: new (opts: {
        map: unknown;
        position: { lat: number; lng: number };
        title: string;
        content: HTMLElement;
      }) => { map: unknown; addListener: (ev: string, cb: () => void) => void };
    };
  };
}

declare global {
  interface Window {
    google: GoogleMapsSDK;
    initGoogleMap?: () => void;
  }
}

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  priceSatang: number;
  title: string;
  selected?: boolean;
}

interface MapViewProps {
  pins: MapPin[];
  centerLat: number;
  centerLng: number;
  onPinClick?: (id: string) => void;
}

let scriptLoaded = false;
let scriptLoading = false;
const callbacks: Array<() => void> = [];

function loadMapsScript(apiKey: string, onLoad: () => void) {
  if (scriptLoaded) { onLoad(); return; }
  callbacks.push(onLoad);
  if (scriptLoading) return;
  scriptLoading = true;

  window.initGoogleMap = () => {
    scriptLoaded = true;
    callbacks.forEach((cb) => cb());
    callbacks.length = 0;
  };

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&callback=initGoogleMap&loading=async`;
  script.async = true;
  document.head.appendChild(script);
}

export function MapView({ pins, centerLat, centerLng, onPinClick }: MapViewProps) {
  const t = useTranslations("Search");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<GoogleMapsSDK["maps"]["Map"]> | null>(null);
  const markersRef = useRef<InstanceType<GoogleMapsSDK["maps"]["marker"]["AdvancedMarkerElement"]>[]>([]);
  const [ready, setReady] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  useEffect(() => {
    if (!apiKey) return;
    loadMapsScript(apiKey, () => setReady(true));
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(containerRef.current, {
        center: { lat: centerLat, lng: centerLng },
        zoom: 12,
        mapId: "urest-search",
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
      });
    }

    // Clear old markers
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    for (const pin of pins) {
      const el = document.createElement("div");
      el.className = [
        "flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold shadow-card cursor-pointer transition",
        pin.selected
          ? "bg-aqua-500 text-ink-900 scale-110"
          : "bg-white text-ink-900 hover:bg-aqua-100",
      ].join(" ");
      el.textContent = formatSatang(pin.priceSatang);

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current,
        position: { lat: pin.lat, lng: pin.lng },
        title: pin.title,
        content: el,
      });

      marker.addListener("click", () => onPinClick?.(pin.id));
      markersRef.current.push(marker);
    }
  }, [ready, pins, centerLat, centerLng, onPinClick]);

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center rounded-card bg-sand-100 text-sm text-ink-900/50">
        {t("mapToggle")} — ไม่พบ API key
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full rounded-card" aria-label="แผนที่ที่พัก" />
  );
}
