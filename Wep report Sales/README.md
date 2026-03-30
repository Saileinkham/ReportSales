# Report Sales (Power BI-like)

เว็บรายงานยอดขายสไตล์ Power BI ที่
- เพิ่ม/อัปโหลดชุดข้อมูลได้ (Excel/CSV/JSON)
- กำหนดหัวคอลัมน์เองได้ (เปลี่ยนชื่อ/ชนิดข้อมูล/ซ่อน/เพิ่มคอลัมน์)
- ออกแบบ Dashboard ได้แบบลากวาง/ปรับขนาด widget (KPI, กราฟ Bar/Line, ตาราง)
- Export/Import ชุดข้อมูลและ Dashboard เป็น JSON

## เริ่มใช้งาน

```bash
npm install
npm run dev
```

## วิธีใช้แบบเร็ว

### 1) เพิ่มชุดข้อมูล (Data Source)
- ไปหน้า `Data Source`
- เลือก `นำเข้า Excel/CSV/JSON` หรือ `วางข้อมูล (Paste)` จากตาราง Excel
- ในหน้าตั้งค่าคอลัมน์:
  - เปลี่ยนชื่อหัวคอลัมน์ (Label)
  - เลือกชนิดข้อมูล: ข้อความ/ตัวเลข/วันที่
  - ซ่อนคอลัมน์ที่ไม่ต้องการ
  - กด `+ เพิ่มคอลัมน์` หากต้องการเพิ่มหัวข้อเอง
- กด `บันทึกชุดข้อมูล`

### 2) ออกแบบ Dashboard
- ไปหน้า `Dashboard`
- กด `+ สร้าง Dashboard` (หรือใช้ `Dashboard ตัวอย่าง`)
- เลือก `Dataset` ที่ต้องการ
- เปิด `โหมดแก้ไข: เปิด`
- เพิ่ม widget:
  - `+ KPI` เลือก measure + aggregation (SUM/AVG/COUNT)
  - `+ Bar` / `+ Line` เลือก dimension + measure + aggregation
  - `+ Table` เลือกคอลัมน์ที่ต้องการแสดง
- ลากวาง/ปรับขนาด widget ได้ทันที และระบบจะบันทึก layout อัตโนมัติใน localStorage

## ไฟล์สำคัญ
- หน้าแอป: [App.jsx](file:///Applications/Report%20Sale/Wep%20report%20Sales/src/App.jsx)
- หน้า Data Source: [DataSourcesPage.jsx](file:///Applications/Report%20Sale/Wep%20report%20Sales/src/pages/DataSourcesPage.jsx)
- หน้า Dashboard Builder: [DashboardsPage.jsx](file:///Applications/Report%20Sale/Wep%20report%20Sales/src/pages/DashboardsPage.jsx)
- ตัวเรนเดอร์ Widget: [WidgetRenderer.jsx](file:///Applications/Report%20Sale/Wep%20report%20Sales/src/components/WidgetRenderer.jsx)
