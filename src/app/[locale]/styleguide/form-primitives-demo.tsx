"use client";

import { useState } from "react";

import { Checkbox } from "@/components/ui/Checkbox";
import { NumberInput } from "@/components/ui/NumberInput";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Select } from "@/components/ui/Select";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { WizardStepper } from "@/components/ui/WizardStepper";

/**
 * Interactive showcase of the wizard form primitives for /styleguide. Lives as a
 * client island because these primitives take change handlers (a server page
 * can't pass functions to client components). Renders default + error + disabled
 * states so design review sees every variant (docs/DESIGN_SYSTEM.md).
 */
export function FormPrimitivesDemo() {
  const [text, setText] = useState("บ้านริมเล จอมเทียน");
  const [area, setArea] = useState("");
  const [price, setPrice] = useState<number | null>(12900);
  const [region, setRegion] = useState("pattaya");
  const [mode, setMode] = useState("REQUEST");
  const [ack, setAck] = useState(false);
  const [step, setStep] = useState(2);
  const [stars, setStars] = useState(0);

  return (
    <div className="flex max-w-md flex-col gap-5">
      <WizardStepper
        current={step}
        onStepSelect={setStep}
        steps={[
          { label: "พื้นฐาน" },
          { label: "รูปภาพ" },
          { label: "รายละเอียด" },
          { label: "กฎ" },
          { label: "ราคา" },
        ]}
      />

      <TextInput
        id="sg-text"
        label="ชื่อที่พัก"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <TextInput
        id="sg-text-err"
        label="ชื่อที่พัก (error state)"
        value=""
        error="ใส่ชื่อที่พัก"
        onChange={() => {}}
      />

      <Textarea
        id="sg-area"
        label="รายละเอียด"
        value={area}
        onChange={(e) => setArea(e.target.value)}
        placeholder="เล่าเกี่ยวกับที่พักของคุณ…"
      />

      <NumberInput
        id="sg-price"
        label="ราคาวันธรรมดา"
        prefix="฿"
        suffix="/ คืน"
        value={price}
        onValueChange={setPrice}
      />

      <Select
        id="sg-region"
        label="พื้นที่"
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        options={[
          { value: "pattaya", label: "พัทยา" },
          { value: "hua-hin", label: "หัวหิน" },
        ]}
      />

      <RadioGroup
        label="โหมดการจอง"
        name="sg-mode"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: "REQUEST", label: "ส่งคำขอก่อน", hint: "โฮสต์ยืนยันก่อนชำระเงิน" },
          { value: "INSTANT", label: "⚡ จองทันที", hint: "จองและชำระได้เลย" },
        ]}
      />

      <Checkbox
        id="sg-ack"
        checked={ack}
        onCheckedChange={setAck}
        label="ปฏิทินของฉันเป็นปัจจุบันเสมอ"
      />

      <StarRatingInput value={stars} onChange={setStars} label="ให้คะแนนรีวิว" />
    </div>
  );
}
