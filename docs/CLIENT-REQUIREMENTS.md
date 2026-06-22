# Client Requirements — Decoded from POS Videos

**Source:** `POS videos/` (IMG_3509, IMG_3511, IMG_3512, IMG_3515, IMG_3516)  
**Client context:** Smart Shop Mart, Pakistan (PKR, Urdu/English)  
**Legacy system:** Windows desktop POS (GRN, Item Information, Cash Purchase)

---

## Video Map

| Video | Content | Key screens |
|-------|---------|-------------|
| IMG_3509 | Item master / product setup | Item Information → Item Definition, Detail View, tabs |
| IMG_3511 | Purchase entry | Cash Purchase, supplier credit, line items |
| IMG_3512 | GRN workflow | Goods Received Note, margins, discounts, sidebar tools |
| IMG_3515 | GRN + paper invoice | GRN screen, Lucky Beverages distributor receipt |
| IMG_3516 | More item setup + label print | New Item form, Label Printing module |

---

## Module 1 — Item / Product (Inventory)

### Tabs (legacy → modern grouped sections)
- Opening Balance
- Item Definition *(primary)*
- Price / Levels
- Multi ALU / Alias (barcodes)
- Image
- Bin Location
- Custom Fields
- Discount
- Kit Formulation
- Qty Prices
- Package
- History
- Min Max

### Item Definition — Required fields
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Item # | Auto number | Yes | e.g. 80219562 |
| Active | Yes/No | Yes | |
| ALU / S.Code | Text | | Barcode / alternate code |
| Short Desc | Text | **Yes** | Product name |
| Long Desc | Text | | |
| Supplier | Lookup | | Link to supplier master |
| Make | Text | | |
| Brand | Dropdown | | |
| Category | Dropdown | **Yes** | BATH ITEMS, BEVERAGE, COSMETICS, etc. |
| Sub Category | Dropdown | | |
| Attributes | Dropdown | | |
| Size | Dropdown | | |
| Colour | Dropdown | | |
| Design/Model | Dropdown | | |
| Department | Dropdown | | |
| Season / Age | Dropdown | | |
| Case/Unit | Text | | |
| Box / Pcs | Number | | Pack size |
| Wgt | Number | | Weight |
| Lead Time | Number | | Days |
| Costing | Dropdown | | Recent Cost / Manual Cost |
| Cost | Currency (PKR) | **Yes** | Highlight field |
| Sale Price | Currency (PKR) | **Yes** | Retail price |
| Sale Rate | Dropdown | | No Entry / etc. |
| Item Type | Dropdown | | Trading Item |
| UOM | Dropdown | | Unit of measure |
| Thresh Hold | Number | | Low stock alert |
| Qty Decimal | Yes/No | | Allow decimal qty |
| Unorderable | Yes/No | | |
| Sales Tax % | Percent | | Green highlight in legacy |
| Disc % | Percent | | |
| Disc (flat) | Currency | | With Calc button |
| St.Dt / End.Dt | Date | | Discount date range |
| Is Style Item | Checkbox | | |
| OEM Barcode | Checkbox | | |
| Is Expired Item | Checkbox | | Track expiry |
| Min Level | Number | | From Inventory screen |
| Max Level | Number | | From Inventory screen |

### Actions
New, Save, Delete, Copy, Paste, Supplier, Label Printer, Keyboard shortcuts (Alt+N, Alt+S, etc.)

---

## Module 2 — Supplier **Master**

| Field | Type | Notes |
|-------|------|-------|
| Supplier Name | Text | **Yes** |
| Contact Person | Text | |
| Phone | Text | |
| Email | Text | |
| Address | Text | |
| City | Text | |
| NTN / STRN | Text | Pakistan tax |
| Bank Account (IBAN) | Text | |
| Credit Balance | Currency | Current Bal from GRN |
| Type | Credit / Cash | |
| Status | Active / Inactive | |
| Notes | Text | |

---

## Module 3 — GRN / Purchase (Cash Purchase)

### Header fields
| Field | Type | Notes |
|-------|------|-------|
| Wk No | Number | Week number |
| PO No | Text | Purchase order |
| Date | Date | |
| Supplier | Lookup | **Yes** — filter supplier inventory |
| Type | Credit / Cash | |
| Current Balance | Currency | Supplier outstanding |
| Product Title | Text | Quick search |
| Auto Rates | Checkbox | |
| Filter Supplier Inventory | Checkbox | |

### Line item grid columns
| Column | Type | Notes |
|--------|------|-------|
| S.No | Auto | |
| ALU | Text | SKU/barcode |
| Product | Text | Name |
| Cases | Number | |
| Qty | Number | **Yes** |
| Free | Number | Promotional free units |
| Disc | Currency | Line discount |
| Disc % | Percent | |
| Freight | Currency | Per line |
| Rate | Currency | Purchase rate |
| Cost | Currency | Unit cost after calc |
| T.Amt | Currency | Line total before discount |
| T.Disc % | Percent | Total line discount % |
| Total | Currency | Line net total |
| Margin % | Percent | vs retail |
| Retail | Currency | Selling price |
| Expiry Date | Date | For perishables |

### Footer / adjustments
| Field | Type | Notes |
|-------|------|-------|
| Total Qty | Number | Sum of quantities |
| Total Margin | Percent | |
| Disc % (-) | Percent | **Disperse on all items** |
| Flat Disc (-) | Currency | e.g. 5000 off whole bill |
| Freight (+) | Currency | **Disperse on all items** |
| S.Tax % (+) | Percent | **Disperse S.Tax** |
| Expense (+) | Currency | |
| Total Amount | Currency | Final payable (PKR) |

### GRN sidebar tools (future)
Load Data, Price Lookup, Supplier, Label Print, Vendor Inventory, Margins, Stock Movement, Apply Margins, Qty Prices

---

## Module 4 — Distributor Invoice (from paper receipt)

Fields seen on Lucky Beverages invoice (for purchase reference):
- Customer Name, Customer ID, Contact Person
- Address, CNIC
- Invoice No, Invoice Date
- Vehicle ID, Seller Name, Delivery Person
- Product Code, Product Name, Qty, Price, Amount
- Bulk discount rules (% off, BUY X GET Y)
- Total Qty, Invoice Total, Total Discount, Advance Pay, Grand Total

---

## Module 5 — Label Printing
- Printer selection (e.g. Zebra)
- Doc Qty, Search, Import, Clear, Preview, Designer
- *(Phase 2 — not in demo slice)*

---

## Module 6 — POS Billing (inferred)
- Scan ALU/barcode → add to cart
- Dual counter tracking
- Payment: Cash, JazzCash, Easypaisa, Card
- Sales tax on items where applicable

---

## Implementation Priority (Demo)

1. **P0** — Expand Product form (Item Definition fields)
2. **P0** — Expand GRN Purchase screen (header + grid + footer adjustments)
3. **P1** — Supplier credit balance + type
4. **P1** — Margin % and retail price on purchase lines
5. **P2** — Label printing, opening balance, kit formulation

---

## Categories (from video dropdown)
BATH ITEMS, BEVERAGE, BIRTHDAY, CAT FOOD, COSMETICS, CROCKERY, (+ more TBD from client)
