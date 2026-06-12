import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Regions — GTM gating (BUSINESS_PLAN §7): Pattaya only at launch.
const REGIONS = [
  { slug: "pattaya", nameTh: "พัทยา", nameEn: "Pattaya", centerLat: 12.9236, centerLng: 100.8825, isActive: true, sortOrder: 0 },
  { slug: "hua-hin", nameTh: "หัวหิน", nameEn: "Hua Hin", centerLat: 12.5684, centerLng: 99.9577, isActive: false, sortOrder: 1 },
  { slug: "khao-yai", nameTh: "เขาใหญ่", nameEn: "Khao Yai", centerLat: 14.4391, centerLng: 101.3725, isActive: false, sortOrder: 2 },
  { slug: "chiang-mai", nameTh: "เชียงใหม่", nameEn: "Chiang Mai", centerLat: 18.7883, centerLng: 98.9853, isActive: false, sortOrder: 3 },
  { slug: "kanchanaburi", nameTh: "กาญจนบุรี", nameEn: "Kanchanaburi", centerLat: 14.0228, centerLng: 99.5328, isActive: false, sortOrder: 4 },
  { slug: "phuket", nameTh: "ภูเก็ต", nameEn: "Phuket", centerLat: 7.8804, centerLng: 98.3923, isActive: false, sortOrder: 5 },
];

// Thai public holidays — FIXED-DATE set only. Lunar-calendar holidays
// (มาฆบูชา วิสาขบูชา อาสาฬหบูชา เข้าพรรษา) MUST be added from the official
// calendar before Phase 3 launch (ADR-011) — do not guess their dates.
const FIXED_HOLIDAYS: Array<[string, string]> = [
  ["01-01", "วันขึ้นปีใหม่"],
  ["04-06", "วันจักรี"],
  ["04-13", "วันสงกรานต์"],
  ["04-14", "วันสงกรานต์"],
  ["04-15", "วันสงกรานต์"],
  ["05-01", "วันแรงงานแห่งชาติ"],
  ["05-04", "วันฉัตรมงคล"],
  ["06-03", "วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี"],
  ["07-28", "วันเฉลิมพระชนมพรรษา ร.10"],
  ["08-12", "วันแม่แห่งชาติ"],
  ["10-13", "วันนวมินทรมหาราช"],
  ["10-23", "วันปิยมหาราช"],
  ["12-05", "วันพ่อแห่งชาติ"],
  ["12-10", "วันรัฐธรรมนูญ"],
  ["12-31", "วันสิ้นปี"],
];

async function main() {
  for (const region of REGIONS) {
    await prisma.region.upsert({
      where: { slug: region.slug },
      update: region,
      create: region,
    });
  }
  console.log(`Seeded ${REGIONS.length} regions (active: pattaya)`);

  const years = [2026, 2027];
  for (const year of years) {
    for (const [monthDay, nameTh] of FIXED_HOLIDAYS) {
      const date = new Date(`${year}-${monthDay}T00:00:00.000Z`);
      await prisma.thaiHoliday.upsert({
        where: { date },
        update: { nameTh },
        create: { date, nameTh },
      });
    }
  }
  console.log(
    `Seeded ${FIXED_HOLIDAYS.length * years.length} fixed-date holidays for ${years.join(", ")} ` +
      `(TODO: add lunar holidays from the official calendar before Phase 3 launch)`,
  );

  // Dev fixture: one host + one published Pattaya villa so search/listing
  // pages have something to render. The Phase 4 eval fixture grows from this.
  if (process.env.NODE_ENV !== "production") {
    const host = await prisma.user.upsert({
      where: { email: "dev-host@urest.local" },
      update: {},
      create: {
        email: "dev-host@urest.local",
        displayName: "โฮสต์ทดสอบ",
        phone: "0800000000",
        phoneVerifiedAt: new Date(),
      },
    });

    const pattaya = await prisma.region.findUniqueOrThrow({
      where: { slug: "pattaya" },
    });

    const existing = await prisma.listing.findFirst({
      where: { hostId: host.id, title: "บ้านพูลวิลล่าทดสอบ จอมเทียน" },
    });
    if (!existing) {
      await prisma.listing.create({
        data: {
          hostId: host.id,
          regionId: pattaya.id,
          status: "PUBLISHED",
          title: "บ้านพูลวิลล่าทดสอบ จอมเทียน",
          description:
            "วิลล่าทดสอบสำหรับการพัฒนา สระส่วนตัว 8x4 เมตร ใกล้หาดจอมเทียน",
          address: "หาดจอมเทียน พัทยา ชลบุรี",
          mapLat: 12.889,
          mapLng: 100.871,
          bedrooms: 4,
          beds: 6,
          baths: 3,
          maxGuests: 12,
          includedGuests: 8,
          extraGuestFeeSatang: 300 * 100, // ฿300/person/night
          poolLengthM: 8,
          poolWidthM: 4,
          poolDepthM: 1.5,
          amenities: ["PRIVATE_POOL", "KARAOKE", "BBQ", "WIFI", "PARKING"],
          partyPolicy: "ASK_FIRST",
          cashDepositSatang: 3_000 * 100, // ฿3,000
          baseWeekdaySatang: 12_900 * 100,
          baseWeekendSatang: 15_900 * 100,
          holidaySatang: 18_900 * 100,
          cancellationTier: "MODERATE",
          bookingMode: "REQUEST",
          publishedAt: new Date(),
          photos: {
            create: [
              { r2Key: "dev/villa-1/cover.webp", sortOrder: 0, isCover: true },
              { r2Key: "dev/villa-1/pool.webp", sortOrder: 1 },
              { r2Key: "dev/villa-1/living.webp", sortOrder: 2 },
              { r2Key: "dev/villa-1/bedroom.webp", sortOrder: 3 },
              { r2Key: "dev/villa-1/bbq.webp", sortOrder: 4 },
            ],
          },
          faqEntries: {
            create: [
              {
                question: "สระเหมาะกับเด็กเล็กไหม",
                answer: "สระลึก 1.5 เมตรตลอดสระ ไม่มีโซนเด็ก แนะนำห่วงยางสำหรับเด็กเล็กค่ะ",
              },
            ],
          },
          seasons: {
            create: [
              {
                nameTh: "ไฮซีซั่น",
                startDate: new Date("2026-11-01T00:00:00.000Z"),
                endDate: new Date("2027-02-28T00:00:00.000Z"),
                weekdaySatang: 14_900 * 100,
                weekendSatang: 17_900 * 100,
              },
            ],
          },
        },
      });
      console.log("Seeded dev host + 1 published Pattaya villa");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
