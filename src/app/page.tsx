import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  Mail,
  Zap,
  Eye,
  Send,
  ArrowUpRight,
} from "lucide-react";

export default function Dashboard() {
  return (
    <main className="w-full p-8 pb-32 pt-10 max-w-5xl mx-auto">
      {/* Soft greeting — original dashboard personality */}
      <div className="flex justify-between items-start mb-10">
        <div>
          <div className="inline-flex items-center bg-[#D3E8FB] text-[#2B608F] px-5 py-2 rounded-full text-sm font-semibold mb-4">
            Welcome back, Sam
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Here&apos;s your money today
          </h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">
            Outstanding invoices, reminders, and what to do next.
          </p>
        </div>
        <button className="bg-[#3B82F6] hover:bg-blue-600 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Invoice
        </button>
      </div>

      {/* Stats — softer, less identical white boxes */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Outstanding"
          value="$12,450"
          accent="bg-white"
        />
        <StatCard
          label="Overdue"
          value="$4,200"
          valueColor="text-red-600"
          hint="3 invoices"
          hintColor="text-red-500"
          accent="bg-[#FFF5F5]"
        />
        <StatCard
          label="Collected"
          value="$8,900"
          hint="This month"
          accent="bg-[#F3FAF6]"
        />
        <StatCard
          label="Unpaid"
          value="7"
          hint="Awaiting payment"
          accent="bg-[#F5F8FF]"
        />
      </div>

      {/* Recommended action — warm wash like original yellow widget */}
      <div className="surface-warm p-5 mb-8 flex items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-white/80 flex items-center justify-center text-amber-600 shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-[#8B7500] uppercase tracking-wide mb-1">
              Recommended next step
            </div>
            <h4 className="font-semibold text-gray-900">INV-1042 is 11 days overdue</h4>
            <p className="text-sm text-gray-600 mt-0.5">
              Acme Corp viewed it yesterday. Send a firmer reminder today.
            </p>
          </div>
        </div>
        <button className="bg-[#3B82F6] text-white px-4 py-2.5 rounded-full text-sm font-medium hover:bg-blue-600 transition-colors flex items-center gap-2 shrink-0">
          <Mail className="w-4 h-4" />
          Send reminder
        </button>
      </div>

      {/* Invoice list — softer panel */}
      <div className="surface-panel overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent invoices</h2>
          <button className="text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1">
            View all <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-gray-400 font-medium">
              <tr className="border-y border-[#EEF0F3]">
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-6 py-3 font-medium">Invoice</th>
                <th className="px-6 py-3 font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Due</th>
                <th className="px-6 py-3 font-medium text-right">Next</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <InvoiceRow
                client="Acme Corp"
                invoice="INV-1042"
                amount="$2,400.00"
                status="Overdue"
                dueDate="Oct 24"
                action="Send reminder"
              />
              <InvoiceRow
                client="Globex Inc"
                invoice="INV-1043"
                amount="$1,800.00"
                status="Viewed"
                dueDate="Nov 02"
                action="Wait"
              />
              <InvoiceRow
                client="Stark Industries"
                invoice="INV-1041"
                amount="$5,000.00"
                status="Paid"
                dueDate="Oct 15"
                action="—"
              />
              <InvoiceRow
                client="Wayne Enterprises"
                invoice="INV-1044"
                amount="$3,250.00"
                status="Sent"
                dueDate="Nov 10"
                action="Wait"
              />
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  valueColor = "text-gray-900",
  hint,
  hintColor = "text-gray-400",
  accent = "bg-white",
}: {
  label: string;
  value: string;
  valueColor?: string;
  hint?: string;
  hintColor?: string;
  accent?: string;
}) {
  return (
    <div className={`${accent} border border-[#EEF0F3] rounded-[1.25rem] p-5`}>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        {label}
      </span>
      <h3 className={`text-2xl font-semibold tracking-tight mt-2 ${valueColor}`}>
        {value}
      </h3>
      {hint && <p className={`text-xs mt-1.5 ${hintColor}`}>{hint}</p>}
    </div>
  );
}

function InvoiceRow({
  client,
  invoice,
  amount,
  status,
  dueDate,
  action,
}: {
  client: string;
  invoice: string;
  amount: string;
  status: string;
  dueDate: string;
  action: string;
}) {
  const getStatusBadge = (s: string) => {
    switch (s.toLowerCase()) {
      case "overdue":
        return (
          <Badge label={s} type="red" icon={<AlertCircle className="w-3 h-3" />} />
        );
      case "paid":
        return (
          <Badge label={s} type="green" icon={<CheckCircle2 className="w-3 h-3" />} />
        );
      case "viewed":
        return <Badge label={s} type="blue" icon={<Eye className="w-3 h-3" />} />;
      case "sent":
        return <Badge label={s} type="gray" icon={<Send className="w-3 h-3" />} />;
      default:
        return <Badge label={s} type="gray" />;
    }
  };

  return (
    <tr className="border-b border-[#EEF0F3] last:border-0 hover:bg-[#FAFBFC] transition-colors cursor-pointer">
      <td className="px-6 py-4 font-medium text-gray-900">{client}</td>
      <td className="px-6 py-4 text-gray-400">{invoice}</td>
      <td className="px-6 py-4 font-medium">{amount}</td>
      <td className="px-6 py-4">{getStatusBadge(status)}</td>
      <td className="px-6 py-4 text-gray-400">{dueDate}</td>
      <td className="px-6 py-4 text-right">
        {action === "Send reminder" ? (
          <button className="text-sm font-medium text-[#3B82F6] hover:text-blue-700 transition-colors">
            Send reminder
          </button>
        ) : (
          <span className="text-sm text-gray-300">{action}</span>
        )}
      </td>
    </tr>
  );
}

function Badge({
  label,
  type,
  icon,
}: {
  label: string;
  type: string;
  icon?: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    red: "bg-red-50 text-red-600",
    blue: "bg-[#EAF3FF] text-[#3B82F6]",
    green: "bg-emerald-50 text-emerald-700",
    gray: "bg-gray-50 text-gray-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-0.5 ${styles[type]}`}
    >
      {icon}
      {label}
    </span>
  );
}
