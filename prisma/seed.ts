import { KycDocumentType, PrismaClient } from "@prisma/client";

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

  // Dev fixture: hosts + published Pattaya villas so search/listing pages have
  // something to render. The Phase 4 eval fixture grows from this.
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

    const host2 = await prisma.user.upsert({
      where: { email: "dev-host2@urest.local" },
      update: {},
      create: {
        email: "dev-host2@urest.local",
        displayName: "บ้านริมหาด",
        phone: "0811111111",
        phoneVerifiedAt: new Date(),
      },
    });

    const host3 = await prisma.user.upsert({
      where: { email: "dev-host3@urest.local" },
      update: {},
      create: {
        email: "dev-host3@urest.local",
        displayName: "วิลล่าลักชัวรี่",
        phone: "0822222222",
        phoneVerifiedAt: new Date(),
      },
    });

    const pattaya = await prisma.region.findUniqueOrThrow({
      where: { slug: "pattaya" },
    });

    // Villa 1 — จอมเทียน, REQUEST mode, 4 bed
    const existing1 = await prisma.listing.findFirst({
      where: { hostId: host.id, title: "บ้านพูลวิลล่าทดสอบ จอมเทียน" },
    });
    if (!existing1) {
      await prisma.listing.create({
        data: {
          hostId: host.id,
          regionId: pattaya.id,
          status: "PUBLISHED",
          title: "บ้านพูลวิลล่าทดสอบ จอมเทียน",
          description:
            "วิลล่าส่วนตัวใกล้หาดจอมเทียน สระว่ายน้ำส่วนตัว 8×4 เมตร ลึก 1.5 เมตร ห้องคาราโอเกะเต็มรูปแบบ เหมาะสำหรับกลุ่มใหญ่ ที่จอดรถ 3 คัน",
          address: "ซอยนาจอมเทียน 12 หาดจอมเทียน พัทยา ชลบุรี 20150",
          mapLat: 12.889,
          mapLng: 100.871,
          bedrooms: 4,
          beds: 6,
          baths: 3,
          maxGuests: 12,
          includedGuests: 8,
          extraGuestFeeSatang: 300 * 100,
          poolLengthM: 8,
          poolWidthM: 4,
          poolDepthM: 1.5,
          amenities: ["PRIVATE_POOL", "KARAOKE", "BBQ", "WIFI", "PARKING"],
          partyPolicy: "ASK_FIRST",
          quietHoursStart: "23:00",
          quietHoursEnd: "07:00",
          cashDepositSatang: 3_000 * 100,
          checkInTime: "14:00",
          checkOutTime: "12:00",
          baseWeekdaySatang: 12_900 * 100,
          baseWeekendSatang: 15_900 * 100,
          holidaySatang: 18_900 * 100,
          cancellationTier: "MODERATE",
          bookingMode: "REQUEST",
          legalBadgeAt: new Date("2026-01-15T00:00:00.000Z"),
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
                sortOrder: 0,
              },
              {
                question: "จอดรถได้กี่คัน",
                answer: "จอดได้ 3 คันในบริเวณบ้าน มีที่จอดรถใต้ร่มไม้ทั้งหมดค่ะ",
                sortOrder: 1,
              },
              {
                question: "เปิดปาร์ตี้ได้ไหม",
                answer: "ปาร์ตี้เบาๆ ได้ค่ะ กรุณาสอบถามก่อนจอง เสียงเงียบหลัง 23:00 น. เพื่อนบ้านอยู่ใกล้กัน",
                sortOrder: 2,
              },
              {
                question: "เช็คอินได้กี่โมง",
                answer: "เช็คอิน 14:00 น. เช็คเอาท์ 12:00 น. หากต้องการ early check-in แจ้งล่วงหน้า 1 วัน",
                sortOrder: 3,
              },
              {
                question: "มี Netflix ไหม",
                answer: "ไม่มี Netflix ค่ะ แต่มี HDMI เชื่อมต่อกับทีวีได้เลย",
                sortOrder: 4,
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
      console.log("Seeded villa 1: จอมเทียน 4 bed REQUEST");
    }

    // Villa 2 — นาเกลือ, INSTANT mode, 3 bed, smaller group
    const existing2 = await prisma.listing.findFirst({
      where: { hostId: host2.id, title: "บ้านริมสวน นาเกลือ" },
    });
    if (!existing2) {
      await prisma.listing.create({
        data: {
          hostId: host2.id,
          regionId: pattaya.id,
          status: "PUBLISHED",
          title: "บ้านริมสวน นาเกลือ",
          description:
            "วิลล่าบรรยากาศสวน สระว่ายน้ำล้นขอบ 6×3 เมตร ใกล้วงเวียนนาเกลือ 5 นาที เงียบสงบ เหมาะครอบครัวเล็ก",
          address: "ซอยนาเกลือ 16 เมืองพัทยา ชลบุรี 20150",
          mapLat: 12.945,
          mapLng: 100.877,
          bedrooms: 3,
          beds: 4,
          baths: 2,
          maxGuests: 8,
          includedGuests: 6,
          extraGuestFeeSatang: 250 * 100,
          poolLengthM: 6,
          poolWidthM: 3,
          poolDepthM: 1.4,
          amenities: ["PRIVATE_POOL", "BBQ", "WIFI", "PARKING", "PET_FRIENDLY"],
          partyPolicy: "FORBIDDEN",
          quietHoursStart: "22:00",
          quietHoursEnd: "08:00",
          cashDepositSatang: 2_000 * 100,
          checkInTime: "15:00",
          checkOutTime: "11:00",
          baseWeekdaySatang: 8_900 * 100,
          baseWeekendSatang: 11_500 * 100,
          holidaySatang: 13_900 * 100,
          cancellationTier: "FLEXIBLE",
          bookingMode: "INSTANT",
          instantAckAt: new Date("2026-03-01T00:00:00.000Z"),
          publishedAt: new Date(),
          photos: {
            create: [
              { r2Key: "dev/villa-2/cover.webp", sortOrder: 0, isCover: true },
              { r2Key: "dev/villa-2/pool.webp", sortOrder: 1 },
              { r2Key: "dev/villa-2/garden.webp", sortOrder: 2 },
              { r2Key: "dev/villa-2/bedroom.webp", sortOrder: 3 },
              { r2Key: "dev/villa-2/kitchen.webp", sortOrder: 4 },
            ],
          },
          faqEntries: {
            create: [
              {
                question: "รับสัตว์เลี้ยงไหม",
                answer: "รับสัตว์เลี้ยงขนาดเล็ก-กลางได้ค่ะ น้ำหนักไม่เกิน 15 กก. กรุณาแจ้งล่วงหน้า",
                sortOrder: 0,
              },
              {
                question: "ครอบครัวมีเด็กเล็กพักได้ไหม",
                answer: "ได้เลยค่ะ สระมีบันได ลึกสุด 1.4 เมตร มีรั้วกั้นรอบสระ",
                sortOrder: 1,
              },
              {
                question: "ใกล้ห้างหรือร้านสะดวกซื้อไหม",
                answer: "7-Eleven ห่าง 200 เมตร Makro ห่าง 3 กม. Terminal 21 Pattaya ห่าง 8 กม.",
                sortOrder: 2,
              },
            ],
          },
          seasons: {
            create: [
              {
                nameTh: "ไฮซีซั่น",
                startDate: new Date("2026-12-01T00:00:00.000Z"),
                endDate: new Date("2027-01-31T00:00:00.000Z"),
                weekdaySatang: 10_900 * 100,
                weekendSatang: 13_900 * 100,
              },
            ],
          },
        },
      });
      console.log("Seeded villa 2: นาเกลือ 3 bed INSTANT");
    }

    // Villa 3 — พัทยาใต้, luxury, INSTANT, 5 bed, pool slide
    const existing3 = await prisma.listing.findFirst({
      where: { hostId: host3.id, title: "วิลล่าลักชัวรี่ พัทยาใต้" },
    });
    if (!existing3) {
      await prisma.listing.create({
        data: {
          hostId: host3.id,
          regionId: pattaya.id,
          status: "PUBLISHED",
          title: "วิลล่าลักชัวรี่ พัทยาใต้",
          description:
            "วิลล่าระดับพรีเมียม สระว่ายน้ำพร้อมสไลเดอร์ 10×5 เมตร ห้องคาราโอเกะ BBQ ริมสระ จอดรถ 5 คัน วิวเนินพัทยาใต้",
          address: "หมู่บ้านกรีนฟิลด์ พัทยาใต้ ชลบุรี 20150",
          mapLat: 12.868,
          mapLng: 100.862,
          bedrooms: 5,
          beds: 8,
          baths: 4,
          maxGuests: 16,
          includedGuests: 10,
          extraGuestFeeSatang: 400 * 100,
          poolLengthM: 10,
          poolWidthM: 5,
          poolDepthM: 1.6,
          amenities: ["PRIVATE_POOL", "POOL_SLIDE", "KARAOKE", "BBQ", "WIFI", "PARKING", "NETFLIX", "POOL_TABLE"],
          partyPolicy: "ALLOWED",
          quietHoursStart: "01:00",
          quietHoursEnd: "08:00",
          cashDepositSatang: 5_000 * 100,
          checkInTime: "14:00",
          checkOutTime: "12:00",
          baseWeekdaySatang: 19_900 * 100,
          baseWeekendSatang: 24_900 * 100,
          holidaySatang: 29_900 * 100,
          cancellationTier: "STRICT",
          bookingMode: "INSTANT",
          instantAckAt: new Date("2026-02-01T00:00:00.000Z"),
          legalBadgeAt: new Date("2026-02-10T00:00:00.000Z"),
          publishedAt: new Date(),
          photos: {
            create: [
              { r2Key: "dev/villa-3/cover.webp", sortOrder: 0, isCover: true },
              { r2Key: "dev/villa-3/pool-slide.webp", sortOrder: 1 },
              { r2Key: "dev/villa-3/karaoke.webp", sortOrder: 2 },
              { r2Key: "dev/villa-3/bbq.webp", sortOrder: 3 },
              { r2Key: "dev/villa-3/master.webp", sortOrder: 4 },
            ],
          },
          faqEntries: {
            create: [
              {
                question: "สไลเดอร์เหมาะกับเด็กอายุเท่าไหร่",
                answer: "เหมาะกับเด็กอายุ 5 ปีขึ้นไป ส่วนสูงไม่ต่ำกว่า 110 ซม. ผู้ใหญ่ต้องดูแลเด็กขณะเล่นค่ะ",
                sortOrder: 0,
              },
              {
                question: "จัดงานปาร์ตี้ได้ไหม ต้องแจ้งล่วงหน้าไหม",
                answer: "ได้เลยค่ะ ปาร์ตี้ได้ถึง 01:00 น. แจ้งจำนวนแขกล่วงหน้า 1 วัน ห้ามเพิ่มเกิน 16 คนในบ้าน",
                sortOrder: 1,
              },
              {
                question: "มี DJ equipment ไหม",
                answer: "ไม่มี DJ equipment ค่ะ แต่มีลำโพง JBL ขนาดใหญ่ 2 ตัวรอบสระ และในห้องคาราโอเกะ",
                sortOrder: 2,
              },
              {
                question: "บริการทำความสะอาดรายวันมีไหม",
                answer: "ไม่มีค่ะ ทำความสะอาดรอบเดียวก่อนเช็คอิน หากต้องการระหว่างพักแจ้ง +500 บาท/ครั้ง",
                sortOrder: 3,
              },
            ],
          },
          seasons: {
            create: [
              {
                nameTh: "ไฮซีซั่น",
                startDate: new Date("2026-11-15T00:00:00.000Z"),
                endDate: new Date("2027-03-15T00:00:00.000Z"),
                weekdaySatang: 24_900 * 100,
                weekendSatang: 29_900 * 100,
              },
            ],
          },
        },
      });
      console.log("Seeded villa 3: พัทยาใต้ 5 bed INSTANT luxury");
    }

    // Attractions — Pattaya POIs for ที่เที่ยวใกล้ๆ
    const pattayaRegion = await prisma.region.findUniqueOrThrow({ where: { slug: "pattaya" } });
    const attractionSeeds = [
      {
        nameTh: "หาดจอมเทียน",
        category: "BEACH" as const,
        lat: 12.882,
        lng: 100.869,
        descTh: "หาดทรายขาวยาว 6 กม. เหมาะเดินเล่นและดูพระอาทิตย์ตก",
      },
      {
        nameTh: "วัดเขาพระบาทใหญ่",
        category: "ACTIVITY" as const,
        lat: 12.945,
        lng: 100.855,
        descTh: "วัดบนเขาวิวพัทยา 360 องศา เดิน 200 ขั้น",
      },
      {
        nameTh: "ตลาดน้ำสี่ภาค",
        category: "FOOD" as const,
        lat: 12.936,
        lng: 100.893,
        descTh: "ตลาดอาหารไทยทุกภาค เปิดเย็น-ดึก บรรยากาศดี",
      },
      {
        nameTh: "Terminal 21 Pattaya",
        category: "SHOPPING" as const,
        lat: 12.928,
        lng: 100.878,
        descTh: "ห้างสรรพสินค้า theme ท่าเรือ ร้านค้า อาหาร",
      },
      {
        nameTh: "หาดพัทยา",
        category: "BEACH" as const,
        lat: 12.930,
        lng: 100.874,
        descTh: "ชายหาดหลักพัทยา กิจกรรมทางน้ำ parasailing jet-ski",
      },
      {
        nameTh: "Sanctuary of Truth",
        category: "ACTIVITY" as const,
        lat: 12.971,
        lng: 100.892,
        descTh: "ปราสาทไม้แกะสลักขนาดมหึมา ริมทะเล งานศิลปะ",
      },
      // #34 starter expansion — well-known Pattaya POIs across all categories.
      // Coordinates/descriptions are approximate starter content; the team
      // verifies + expands toward ~50 before launch (append-only, idempotent).
      {
        nameTh: "ตลาดเทพประสิทธิ์",
        category: "FOOD" as const,
        lat: 12.886,
        lng: 100.892,
        descTh: "ตลาดนัดกลางคืน เปิดศุกร์-อาทิตย์ สตรีทฟู้ด ของกิน เสื้อผ้า",
      },
      {
        nameTh: "ตลาดลานโพธิ์ นาเกลือ",
        category: "FOOD" as const,
        lat: 12.962,
        lng: 100.892,
        descTh: "ตลาดอาหารทะเลสดและของกินพื้นเมืองนาเกลือ ราคาเป็นกันเอง",
      },
      {
        nameTh: "The Sky Gallery Pattaya",
        category: "FOOD" as const,
        lat: 12.914,
        lng: 100.861,
        descTh: "ร้านอาหารริมหน้าผาเขาพระตำหนัก วิวทะเลพัทยา บรรยากาศชิล",
      },
      {
        nameTh: "Mum Aroi นาเกลือ",
        category: "FOOD" as const,
        lat: 12.967,
        lng: 100.894,
        descTh: "ร้านอาหารทะเลริมทะเลชื่อดัง บรรยากาศเรือประมงเก่า",
      },
      {
        nameTh: "หาดวงศ์อมาตย์",
        category: "BEACH" as const,
        lat: 12.965,
        lng: 100.888,
        descTh: "หาดเงียบสงบย่านนาเกลือ น้ำใส เหมาะพักผ่อนแบบไม่พลุกพล่าน",
      },
      {
        nameTh: "หาดพัทยาเหนือ",
        category: "BEACH" as const,
        lat: 12.948,
        lng: 100.881,
        descTh: "ชายหาดพัทยาช่วงเหนือ ร่มรื่นด้วยทิวสน เล่นน้ำและกีฬาทางน้ำ",
      },
      {
        nameTh: "เกาะล้าน",
        category: "BEACH" as const,
        lat: 12.918,
        lng: 100.785,
        descTh: "เกาะน้ำใสนอกฝั่งพัทยา หาดทรายขาว ดำน้ำดูปะการัง นั่งเรือราว 45 นาที",
      },
      {
        nameTh: "จุดชมวิวเขาพระตำหนัก",
        category: "ACTIVITY" as const,
        lat: 12.911,
        lng: 100.87,
        descTh: "จุดชมวิวอ่าวพัทยาแบบพาโนรามา ถ่ายรูปป้ายพัทยาและพระอาทิตย์ตก",
      },
      {
        nameTh: "พระพุทธรูปใหญ่ เขาพระตำหนัก (Big Buddha)",
        category: "ACTIVITY" as const,
        lat: 12.917,
        lng: 100.873,
        descTh: "พระพุทธรูปองค์ใหญ่บนเขาพระตำหนัก จุดไหว้พระและชมวิวเมือง",
      },
      {
        nameTh: "สวนนงนุชพัทยา",
        category: "ACTIVITY" as const,
        lat: 12.766,
        lng: 100.935,
        descTh: "สวนพฤกษศาสตร์ขนาดใหญ่ สวนจัดธีมสวยงาม โชว์ช้างและวัฒนธรรมไทย",
      },
      {
        nameTh: "Columbia Pictures Aquaverse",
        category: "ACTIVITY" as const,
        lat: 12.838,
        lng: 100.935,
        descTh: "สวนน้ำธีมภาพยนตร์ขนาดใหญ่ เครื่องเล่นสไลเดอร์หลากหลาย เหมาะทั้งครอบครัว",
      },
      {
        nameTh: "Tiffany's Show Pattaya",
        category: "ACTIVITY" as const,
        lat: 12.951,
        lng: 100.884,
        descTh: "โชว์คาบาเรต์ระดับโลก การแสดงแสงสีเสียงตระการตา รอบค่ำ",
      },
      {
        nameTh: "Frost Magical Ice of Siam",
        category: "ACTIVITY" as const,
        lat: 12.88,
        lng: 100.918,
        descTh: "โลกน้ำแข็งและงานแกะสลักหิมะในร่ม กิจกรรมถ่ายรูปสำหรับครอบครัว",
      },
      {
        nameTh: "Central Pattaya",
        category: "SHOPPING" as const,
        lat: 12.929,
        lng: 100.878,
        descTh: "ห้างสรรพสินค้าใหญ่ติดหาดพัทยา ร้านแบรนด์ อาหาร และโรงภาพยนตร์",
      },
      {
        nameTh: "The Avenue Pattaya",
        category: "SHOPPING" as const,
        lat: 12.927,
        lng: 100.879,
        descTh: "คอมมูนิตี้มอลล์ใจกลางพัทยา ร้านอาหาร ซูเปอร์มาร์เก็ต ใกล้หาด",
      },
      {
        nameTh: "Outlet Mall Pattaya",
        category: "SHOPPING" as const,
        lat: 12.901,
        lng: 100.911,
        descTh: "เอาท์เล็ตสินค้าแบรนด์ลดราคา ของฝากและของกินครบ",
      },
      {
        nameTh: "Mike Shopping Mall",
        category: "SHOPPING" as const,
        lat: 12.927,
        lng: 100.876,
        descTh: "ห้างเก่าแก่ติดหาดพัทยากลาง เสื้อผ้า ของฝาก ราคาย่อมเยา",
      },
    ];

    for (const attr of attractionSeeds) {
      const exists = await prisma.attraction.findFirst({
        where: { regionId: pattayaRegion.id, nameTh: attr.nameTh },
      });
      if (!exists) {
        await prisma.attraction.create({
          data: { ...attr, regionId: pattayaRegion.id },
        });
      }
    }
    console.log(`Seeded ${attractionSeeds.length} Pattaya attractions`);

    // Admin approval-queue fixtures (#14): listings awaiting review (one fresh,
    // one >24h overdue to exercise the SLA flag) + a NEEDS_INFO listing to drive
    // the host to-do/resubmit loop without first running an admin decision.
    // KYC doc r2Keys are placeholders — signed-URL GETs 404 on missing bytes in
    // dev; real bytes come from a freshly host-submitted listing.
    const HOUR_MS = 60 * 60 * 1000;
    const reviewNow = new Date();

    async function seedReviewListing(opts: {
      hostId: string;
      title: string;
      status: "PENDING_REVIEW" | "NEEDS_INFO";
      submittedAt: Date;
      needsInfoItems?: unknown;
      withHotelLicense?: boolean;
    }): Promise<void> {
      const exists = await prisma.listing.findFirst({ where: { title: opts.title } });
      if (exists) return;

      const listing = await prisma.listing.create({
        data: {
          hostId: opts.hostId,
          regionId: pattaya.id,
          status: opts.status,
          title: opts.title,
          description: "วิลล่าทดสอบสำหรับคิวตรวจสอบ สระส่วนตัว ใกล้หาด",
          address: "ซอยทดสอบ พัทยา ชลบุรี 20150",
          mapLat: 12.92,
          mapLng: 100.88,
          bedrooms: 3,
          beds: 4,
          baths: 2,
          maxGuests: 8,
          includedGuests: 6,
          baseWeekdaySatang: 9_900 * 100,
          baseWeekendSatang: 12_900 * 100,
          cancellationTier: "MODERATE",
          bookingMode: "REQUEST",
          photos: {
            create: [0, 1, 2, 3, 4].map((i) => ({
              r2Key: `dev/review/${opts.hostId}-${i}.webp`,
              sortOrder: i,
              isCover: i === 0,
            })),
          },
        },
      });

      const submission = await prisma.kycSubmission.create({
        data: {
          userId: opts.hostId,
          listingId: listing.id,
          status: opts.status,
          submittedAt: opts.submittedAt,
          ...(opts.needsInfoItems
            ? { needsInfoItems: opts.needsInfoItems as object }
            : {}),
        },
      });

      const types: KycDocumentType[] = [
        KycDocumentType.THAI_ID,
        KycDocumentType.RIGHT_TO_RENT,
        KycDocumentType.SELFIE,
        ...(opts.withHotelLicense ? [KycDocumentType.HOTEL_LICENSE] : []),
      ];
      await prisma.kycDocument.createMany({
        data: types.map((type) => ({
          submissionId: submission.id,
          type,
          r2Key: `kyc/${submission.id}/${type}`,
        })),
      });
    }

    await seedReviewListing({
      hostId: host.id,
      title: "บ้านรอตรวจสอบ จอมเทียน (ทดสอบ)",
      status: "PENDING_REVIEW",
      submittedAt: new Date(reviewNow.getTime() - 2 * HOUR_MS),
    });
    await seedReviewListing({
      hostId: host2.id,
      title: "บ้านรอตรวจสอบเกินเวลา นาเกลือ (ทดสอบ)",
      status: "PENDING_REVIEW",
      submittedAt: new Date(reviewNow.getTime() - 26 * HOUR_MS),
      withHotelLicense: true,
    });
    await seedReviewListing({
      hostId: host3.id,
      title: "บ้านขอข้อมูลเพิ่ม พัทยาใต้ (ทดสอบ)",
      status: "NEEDS_INFO",
      submittedAt: new Date(reviewNow.getTime() - 10 * HOUR_MS),
      needsInfoItems: [
        { item: "THAI_ID_UNCLEAR", note: "รูปบัตรเบลอ ถ่ายใหม่ให้ชัด", satisfied: false },
        { item: "BANK_NAME_MISMATCH", note: "ชื่อบัญชีไม่ตรงกับบัตร", satisfied: false },
      ],
    });
    console.log("Seeded 3 approval-queue fixtures (pending, overdue, needs-info)");

    // Reports-queue fixtures (#27): a booking report on a HELD booking (drives
    // accept → ledger freeze) + a listing report (drives unlist). Idempotent.
    const villa1 = await prisma.listing.findFirst({
      where: { title: "บ้านพูลวิลล่าทดสอบ จอมเทียน" },
      select: { id: true },
    });
    if (villa1) {
      const guest = await prisma.user.upsert({
        where: { email: "dev-guest@urest.local" },
        update: {},
        create: {
          email: "dev-guest@urest.local",
          displayName: "ผู้เข้าพักทดสอบ",
          phone: "0899999999",
          phoneVerifiedAt: new Date(),
        },
      });

      const existingBooking = await prisma.booking.findUnique({ where: { code: "UR-2606-9001" } });
      if (!existingBooking) {
        const total = 25_800 * 100;
        const booking = await prisma.booking.create({
          data: {
            code: "UR-2606-9001",
            listingId: villa1.id,
            userId: guest.id,
            status: "CHECKED_IN",
            bookingMode: "REQUEST",
            checkIn: new Date("2026-06-16T00:00:00.000Z"),
            checkOut: new Date("2026-06-18T00:00:00.000Z"),
            priceLines: [{ label: "2 คืน", amountSatang: total }],
            totalSatang: total,
            commissionSatang: total / 10,
            cancellationTier: "MODERATE",
            escrowState: "HELD",
          },
        });
        // Ledger NONE → HELD so currentPosition derives a freezable position.
        await prisma.ledgerEntry.create({
          data: {
            bookingId: booking.id,
            amountSatang: total,
            fromState: "NONE",
            toState: "HELD",
            cause: "CHARGE_WEBHOOK",
            causeRef: "seed",
          },
        });
        await prisma.report.create({
          data: {
            reporterId: guest.id,
            bookingId: booking.id,
            category: "SAFETY",
            text: "เครื่องทำน้ำอุ่นชำรุด ใช้งานไม่ได้ตลอดการเข้าพัก",
            photoKeys: [],
          },
        });
      }

      const existingListingReport = await prisma.report.findFirst({
        where: { listingId: villa1.id, category: "SUSPECTED_FRAUD" },
      });
      if (!existingListingReport) {
        await prisma.report.create({
          data: {
            listingId: villa1.id,
            category: "SUSPECTED_FRAUD",
            text: "สงสัยรูปภาพไม่ใช่ของจริง — เหมือนนำมาจากเว็บอื่น",
            photoKeys: [],
          },
        });
      }
      console.log("Seeded reports-queue fixtures (booking report on HELD booking + listing report)");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
