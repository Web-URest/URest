"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PhotoLightbox } from "@/components/ui/PhotoLightbox";
import { useToast } from "@/components/ui/Toast";

/** Dev-only interactive demo of the v3 overlay primitives for /styleguide. */
const DEMO_PHOTOS = [
  { url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%23ff385c'/%3E%3C/svg%3E", alt: "1" },
  { url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%230b7a5b'/%3E%3C/svg%3E", alt: "2" },
];

export function OverlayDemo() {
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const toast = useToast();

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="ghost" onClick={() => setModal(true)}>Open Modal</Button>
      <Button variant="ghost" onClick={() => setSheet(true)}>Open BottomSheet</Button>
      <Button variant="ghost" onClick={() => setLightbox(true)}>Open Lightbox</Button>
      <Button variant="ghost" onClick={() => toast.show({ message: "บันทึกแล้ว", tone: "success", actionLabel: "เลิกทำ", onAction: () => {} })}>
        Show Toast
      </Button>

      <Modal open={modal} onClose={() => setModal(false)} title="ตัวกรอง" closeLabel="ปิด" footer={<Button variant="primary" onClick={() => setModal(false)}>ใช้ตัวกรอง</Button>}>
        <p className="text-sm text-ink-700">เนื้อหาตัวอย่างใน Modal — ใช้สำหรับตัวกรอง / ยืนยัน / แกลเลอรีบนเดสก์ท็อป</p>
      </Modal>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="ตัวกรอง" closeLabel="ปิด">
        <p className="text-sm text-ink-700">Bottom sheet สำหรับมือถือ — ตัวกรอง แผนที่ และ login sheet</p>
      </BottomSheet>

      <PhotoLightbox
        open={lightbox}
        onClose={() => setLightbox(false)}
        photos={DEMO_PHOTOS}
        closeLabel="ปิด"
        prevLabel="ก่อนหน้า"
        nextLabel="ถัดไป"
      />
    </div>
  );
}
