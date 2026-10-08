# Revenue Reporting

GoRent includes a revenue model based on booking payments, platform fees, commission, delivery fees, and lister payouts.

## Revenue Model

The platform can earn revenue from:

1. A flat booking fee.
2. A percentage commission from each rental.
3. Optional dropoff or delivery fees.
4. Future targeted ads or anonymized demand trend reports.

## Revenue Table

Revenue is stored in the `Revenue` table.

| Column | Purpose |
| --- | --- |
| `revenue_id` | Primary key. |
| `payment_id` | Links revenue to the payment. |
| `booking_fee` | Flat platform booking fee. |
| `commission` | Platform commission from the rental total. |
| `dropoff_fee` | Optional delivery/dropoff fee. |
| `platform_payout` | Platform earnings from the booking. |
| `lister_payout` | Amount owed to the vehicle owner. |
| `payout_date` | Date/time revenue was recorded. |

## Revenue Trigger

The file below adds a trigger that automatically creates a revenue row when a payment is completed:

```text
backend/migrations/stored_procedures_triggers.sql
```

Trigger:

```text
trg_create_revenue_for_completed_payment
```

Trigger function:

```text
create_revenue_for_completed_payment()
```

## Revenue Reporting View

The file below creates an owner revenue report view:

```text
backend/migrations/views.sql
```

View:

```text
owner_revenue_report
```

The view joins:

```text
User -> Vehicle -> Listing -> Booking -> Payment -> Revenue
```

This makes reporting easier because the app or evaluator can query one view instead of manually joining every table.

## Example Report Query

```sql
SELECT
    owner_user_id,
    owner_first_name,
    owner_last_name,
    COUNT(payment_id) AS completed_payments,
    SUM(payment_amount) AS total_payment_amount,
    SUM(booking_fee) AS total_booking_fees,
    SUM(commission) AS total_commission,
    SUM(dropoff_fee) AS total_dropoff_fees,
    SUM(platform_payout) AS total_platform_payout,
    SUM(lister_payout) AS total_lister_payout
FROM owner_revenue_report
GROUP BY owner_user_id, owner_first_name, owner_last_name
ORDER BY total_platform_payout DESC;
```

## Demo Talking Point

During the final demo, show that when a booking/payment is completed, the database trigger can automatically create the revenue record. Then show the `owner_revenue_report` view or a dashboard summary that displays platform payout and lister payout.

## Optional CSV Export Plan

A simple CSV export can be added by querying `owner_revenue_report` and returning rows as CSV from the backend. Suggested route:

```text
GET /api/reports/revenue.csv
```

Suggested frontend button:

```text
Export Revenue Report
```
