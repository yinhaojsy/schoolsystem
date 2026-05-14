# Payment System Guide

## Overview
The school system now supports partial payments, automatic payment allocation, and student-specific fee customization.

## Key Features

### 1. Partial Payment System
- **Record Payment Button**: Available for pending invoices
- **Automatic Allocation**: Payments are allocated in priority order:
  1. Registration Fee (highest priority)
  2. Annual Charges
  3. Monthly Fee
  4. Meals (lowest priority)
- **Real-time Preview**: See how your payment will be allocated before confirming
- **Payment History**: Track all payments made on an invoice

### 2. Smart Invoice Generation
When creating an invoice, the system automatically:
- **Registration Fee**: Only charged if never fully paid (one-time charge)
- **Annual Charges**: Only charged once per year
- **Monthly Fee**: Charged every month
- **Meals**: Charged every month

The system checks payment history to avoid duplicate charges.

### 3. Student Fee Customization
Navigate to **Students List** → Click **Manage Fees** on any student:
- **Custom Amount**: Set a different fee for specific charge types
- **Exemptions**: Exempt students from specific charges (e.g., scholarship students)
- **Notes**: Document the reason for the override

### 4. Fee Override Examples
- Student joins mid-year: Exempt from annual charges for that year
- Scholarship student: Exempt from registration fee or reduce monthly fee
- Special case: Custom meal charges based on dietary needs

## How to Use

### Recording a Partial Payment
1. Go to **Invoices** page
2. Find the pending invoice
3. Click **Record Payment**
4. Enter the payment amount (can be less than total)
5. Review the allocation preview
6. Confirm payment

The system will:
- Allocate the payment according to priority
- Update each charge item's paid amount
- Automatically mark invoice as "paid" when fully settled
- Track remaining balance

### Setting Fee Overrides
1. Go to **Students List**
2. Click **Manage Fees** for the student
3. Select the charge type (Registration/Annual/Monthly/Meals)
4. Either:
   - Enter a custom amount, OR
   - Check "Exempt" to waive the charge
5. Add notes explaining the override
6. Click **Save Override**

### Creating Invoices with Overrides
Simply create invoices as normal. The system will:
- Apply any custom amounts automatically
- Skip exempted charges
- Check if registration/annual fees were already charged
- Calculate the correct total

## Database Changes
New tables added:
- `payment_history`: Tracks all payments with allocations
- `student_fee_overrides`: Stores custom fees per student
- `invoice_items`: Enhanced with `paidAmount` and `chargeType` fields

## Important Notes
1. **Registration Fee**: One-time charge, won't appear in future invoices once paid
2. **Annual Charges**: Charged once per year, tracks by year
3. **Partial Payments**: Always allocated by priority (can't choose which item to pay)
4. **Fee Overrides**: Apply immediately to new invoices
5. **Mark Paid**: Still available for full payment without item-level tracking

## API Endpoints
- `POST /api/invoices/:id/payments` - Record partial payment
- `GET /api/invoices/:id/payments` - Get payment history
- `GET /api/students/:id/payment-history` - Get student payment summary
- `GET /api/students/:id/fee-overrides` - Get student fee overrides
- `POST /api/students/:id/fee-overrides` - Create/update fee override
- `DELETE /api/students/:studentId/fee-overrides/:overrideId` - Remove override

## Migration
The database schema updates automatically on server restart. Existing invoices will continue to work, but won't have item-level payment tracking until you record a new payment.
