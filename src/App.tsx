// @ts-nocheck
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  X,
  Syringe,
  Sparkles,
  HeartPulse,
  ShoppingBag,
  Beaker,
  Package,
  Home,
  Megaphone,
  GraduationCap,
  Landmark,
  Receipt,
  Wallet,
  Droplets,
  SprayCan,
  TrendingUp,
  TrendingDown,
  Percent,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// ---------------------------------------------------------------------------
// Supabase REST API (без @supabase/supabase-js — лише fetch)
// ---------------------------------------------------------------------------

const SUPABASE_URL = "https://agurqtagivdnmrjnjnzr.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_2bTfh2cvnxdqP2wsjzmv-Q_24Py10Bp";

const supabaseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

// transactions.category_id — це зовнішній ключ на таблицю categories.
// Щоб показувати назву/тип категорії (дохід чи витрата), а не «сирий» id,
// категорії підвантажуються окремим запитом і використовуються для мапінгу.
async function fetchCategories() {
  const response = await fetch(
    `${SUPABASE_URL}categories?select=id,name,type,category_group`,
    { headers: supabaseHeaders }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Помилка завантаження категорій (${response.status}): ${text}`
    );
  }
  return response.json();
}

async function fetchTransactions() {
  const response = await fetch(
    `${SUPABASE_URL}transactions?select=id,amount,transaction_date,category_id,note&order=transaction_date.desc`,
    { headers: supabaseHeaders }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Помилка завантаження транзакцій (${response.status}): ${text}`
    );
  }
  return response.json();
}

async function insertTransaction({
  amount,
  transaction_date,
  category_id,
  note,
}) {
  const response = await fetch(`${SUPABASE_URL}transactions`, {
    method: "POST",
    headers: {
      ...supabaseHeaders,
      Prefer: "return=representation",
    },
    body: JSON.stringify({ amount, transaction_date, category_id, note }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Помилка збереження (${response.status}): ${text}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
}

// ---------------------------------------------------------------------------
// Константи оформлення
// ---------------------------------------------------------------------------

// Класифікація витрат для розрахунку маржинальності:
// змінні — напряму пов'язані з виконанням процедур.
const VARIABLE_GROUP = "variable";

// Пастельна палітра для Donut Chart
const DONUT_COLORS = [
  "#A7C4A0",
  "#9FB8D8",
  "#E3B88A",
  "#D9C9A8",
  "#B7CFC9",
  "#D8B4A0",
];

// Іконки за назвою категорії — для «читабельного» списку операцій.
// Якщо назва категорії з бази не знайдена в мапі — використовується Receipt.
const CATEGORY_ICONS = {
  "Ін'єкції": Syringe,
  Догляди: Sparkles,
  "Тіло/Психосоматика": HeartPulse,
  "Рітейл косметики": ShoppingBag,
  "Ін'єкційні препарати": Beaker,
  "Витратні матеріали": Package,
  Оренда: Home,
  Реклама: Megaphone,
  Навчання: GraduationCap,
  Податки: Landmark,
  "Комунальні послуги": Droplets,
  Прибирання: SprayCan,
};

const MONTH_NAMES_UK = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];

const formatMoney = (value) =>
  new Intl.NumberFormat("uk-UA").format(Math.abs(value)) + " ₴";

const formatShortDate = (isoDate) => {
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
};

// ---------------------------------------------------------------------------
// Компонент
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'analytics'
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [modalType, setModalType] = useState(null); // 'income' | 'expense' | null
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // -------------------------------------------------------------------------
  // Завантаження категорій і транзакцій з Supabase (REST, через fetch)
  // -------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, txs] = await Promise.all([
        fetchCategories(),
        fetchTransactions(),
      ]);
      setCategories(cats || []);
      setTransactions(txs || []);
    } catch (err) {
      setError(err.message || "Не вдалося завантажити дані з бази");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const categoryById = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [categories]);

  // Транзакції, збагачені даними категорії (назва/тип/група) для зручності рендеру
  const enrichedTransactions = useMemo(
    () =>
      transactions.map((t) => ({
        ...t,
        category: categoryById[t.category_id] || null,
      })),
    [transactions, categoryById]
  );

  // -------------------------------------------------------------------------
  // Фільтрація по місяцях (за transaction_date)
  // -------------------------------------------------------------------------

  const filterByMonth = (list, date) =>
    list.filter((t) => {
      if (!t.transaction_date) return false;
      const d = new Date(t.transaction_date);
      return (
        d.getMonth() === date.getMonth() &&
        d.getFullYear() === date.getFullYear()
      );
    });

  const monthTransactions = useMemo(
    () => filterByMonth(enrichedTransactions, selectedDate),
    [enrichedTransactions, selectedDate]
  );

  const previousMonthDate = useMemo(() => {
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() - 1);
    return d;
  }, [selectedDate]);

  const previousMonthTransactions = useMemo(
    () => filterByMonth(enrichedTransactions, previousMonthDate),
    [enrichedTransactions, previousMonthDate]
  );

  const shiftMonth = (direction) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  // -------------------------------------------------------------------------
  // Розрахунки — поточний місяць
  // -------------------------------------------------------------------------

  const sumByType = (list, type) =>
    list
      .filter((t) => t.category?.type === type)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalIncome = useMemo(
    () => sumByType(monthTransactions, "income"),
    [monthTransactions]
  );
  const totalExpense = useMemo(
    () => sumByType(monthTransactions, "expense"),
    [monthTransactions]
  );
  const netProfit = totalIncome - totalExpense;

  const variableExpense = useMemo(
    () =>
      monthTransactions
        .filter(
          (t) =>
            t.category?.type === "expense" &&
            t.category?.category_group === VARIABLE_GROUP
        )
        .reduce((sum, t) => sum + Number(t.amount || 0), 0),
    [monthTransactions]
  );

  const marginPct =
    totalIncome > 0
      ? ((totalIncome - variableExpense) / totalIncome) * 100
      : null;

  const incomeDonutData = useMemo(() => {
    const grouped = {};
    monthTransactions
      .filter((t) => t.category?.type === "income")
      .forEach((t) => {
        const name = t.category?.name || "Інше";
        grouped[name] = (grouped[name] || 0) + Number(t.amount || 0);
      });
    return Object.entries(grouped)
      .map(([name, amount], idx) => ({
        name,
        amount,
        color: DONUT_COLORS[idx % DONUT_COLORS.length],
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthTransactions]);

  const topExpenses = useMemo(() => {
    const grouped = {};
    monthTransactions
      .filter((t) => t.category?.type === "expense")
      .forEach((t) => {
        const name = t.category?.name || "Інше";
        grouped[name] = (grouped[name] || 0) + Number(t.amount || 0);
      });
    const all = Object.entries(grouped)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
    const max = all[0]?.amount || 1;
    return all.map((e) => ({ ...e, pct: Math.round((e.amount / max) * 100) }));
  }, [monthTransactions]);

  const sortedTransactions = useMemo(
    () =>
      [...monthTransactions].sort(
        (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date)
      ),
    [monthTransactions]
  );

  const hasTransactions = monthTransactions.length > 0;

  // -------------------------------------------------------------------------
  // Аналітика — порівняння з попереднім місяцем
  // -------------------------------------------------------------------------

  const previousIncome = useMemo(
    () => sumByType(previousMonthTransactions, "income"),
    [previousMonthTransactions]
  );

  const incomeChangePct = useMemo(() => {
    if (previousIncome === 0) return null;
    return ((totalIncome - previousIncome) / previousIncome) * 100;
  }, [totalIncome, previousIncome]);

  // -------------------------------------------------------------------------
  // Аналітика — тренд прибутку по днях (наростаючим підсумком)
  // -------------------------------------------------------------------------

  const trendData = useMemo(() => {
    const byDay = {};
    monthTransactions.forEach((t) => {
      const day = new Date(t.transaction_date).getDate();
      const signedAmount =
        t.category?.type === "income" ? Number(t.amount) : -Number(t.amount);
      byDay[day] = (byDay[day] || 0) + signedAmount;
    });

    const days = Object.keys(byDay)
      .map(Number)
      .sort((a, b) => a - b);

    let cumulative = 0;
    return days.map((day) => {
      cumulative += byDay[day];
      return { day: `${day}`, profit: cumulative };
    });
  }, [monthTransactions]);

  // -------------------------------------------------------------------------
  // Модальне вікно — збереження в Supabase через fetch (POST)
  // -------------------------------------------------------------------------

  const openModal = (type) => {
    setModalType(type);
    setSelectedCategoryId("");
    setAmountInput("");
    setNoteInput("");
    setFormError(null);
  };

  const closeModal = () => {
    if (saving) return;
    setModalType(null);
    setFormError(null);
  };

  const modalCategories = useMemo(
    () => categories.filter((c) => c.type === modalType),
    [categories, modalType]
  );

  const handleSave = async () => {
    if (!selectedCategoryId) {
      setFormError("Оберіть категорію");
      return;
    }
    const amountValue = parseFloat(amountInput);
    if (!amountValue || amountValue <= 0) {
      setFormError("Введіть коректну суму");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      amount: amountValue,
      transaction_date: new Date().toISOString().slice(0, 10),
      category_id: selectedCategoryId,
      note: noteInput.trim() || null,
    };

    try {
      const saved = await insertTransaction(payload);
      setTransactions((prev) => [
        saved || { id: Date.now(), ...payload },
        ...prev,
      ]);
      setModalType(null);
    } catch (err) {
      setFormError(err.message || "Не вдалося зберегти операцію в базі");
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Рендер
  // -------------------------------------------------------------------------

  return (
    <div className="relative max-w-md mx-auto h-screen overflow-y-auto bg-gray-50 text-gray-700 font-sans">
      {/* Верхня панель */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <p className="text-base font-bold text-gray-800 tracking-tight">
          Фінансовий дашборд
        </p>
        <div className="flex items-center gap-0.5 bg-white rounded-full shadow-sm px-1 py-1">
          <button
            onClick={() => shiftMonth(-1)}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-all hover:bg-gray-100"
            aria-label="Попередній місяць"
          >
            <ChevronLeft size={14} className="text-gray-400" />
          </button>
          <span className="text-xs font-semibold text-gray-600 px-1 min-w-[92px] text-center">
            {MONTH_NAMES_UK[selectedDate.getMonth()]}{" "}
            {selectedDate.getFullYear()}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-all hover:bg-gray-100"
            aria-label="Наступний місяць"
          >
            <ChevronRight size={14} className="text-gray-400" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mb-4 bg-red-50 rounded-2xl px-4 py-3">
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="px-5">
          <p className="text-sm text-gray-400 mb-4">
            Завантаження даних з бази...
          </p>
          <div className="animate-pulse h-28 bg-gray-200 rounded-2xl mb-4" />
          <div className="animate-pulse h-12 bg-gray-200 rounded-2xl mb-4" />
          <div className="animate-pulse h-40 bg-gray-200 rounded-2xl mb-4" />
          <div className="animate-pulse h-40 bg-gray-200 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Перемикач вкладок */}
          <div className="px-5">
            <div className="flex bg-gray-100 rounded-2xl p-1">
              <button
                onClick={() => setActiveTab("overview")}
                className={`flex-1 text-sm font-bold py-2 rounded-xl transition-all ${
                  activeTab === "overview"
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-400 hover:text-gray-500"
                }`}
              >
                Огляд
              </button>
              <button
                onClick={() => setActiveTab("analytics")}
                className={`flex-1 text-sm font-bold py-2 rounded-xl transition-all ${
                  activeTab === "analytics"
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-400 hover:text-gray-500"
                }`}
              >
                Аналітика
              </button>
            </div>
          </div>

          {/* Головна карточка */}
          <div className="mx-5 mt-4 bg-neutral-900 rounded-2xl shadow-sm px-5 py-6">
            <p className="text-neutral-400 text-xs uppercase tracking-wider">
              Чистий прибуток
            </p>
            <p className="text-white text-4xl font-bold mt-1 tracking-tight">
              {formatMoney(netProfit)}
            </p>

            <div className="flex items-center gap-6 mt-5 pt-4 border-t border-neutral-700">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 flex items-center justify-center bg-emerald-500/20 rounded-full">
                  <ArrowUpRight size={15} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-neutral-400 text-[11px] leading-tight">
                    Дохід
                  </p>
                  <p className="text-white text-sm font-bold leading-tight">
                    {formatMoney(totalIncome)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 flex items-center justify-center bg-amber-500/20 rounded-full">
                  <ArrowDownRight size={15} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-neutral-400 text-[11px] leading-tight">
                    Витрати
                  </p>
                  <p className="text-white text-sm font-bold leading-tight">
                    {formatMoney(totalExpense)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Швидкі дії */}
          <div className="flex gap-3 px-5 mt-4">
            <button
              onClick={() => openModal("income")}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white rounded-2xl py-3.5 shadow-sm transition-all hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus size={17} />
              <span className="text-sm font-bold">Дохід</span>
            </button>
            <button
              onClick={() => openModal("expense")}
              className="flex-1 flex items-center justify-center gap-1.5 bg-amber-600 text-white rounded-2xl py-3.5 shadow-sm transition-all hover:bg-amber-700 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Minus size={17} />
              <span className="text-sm font-bold">Витрата</span>
            </button>
          </div>

          {/* ---------------------------------------------------------- */}
          {/* Вкладка «Огляд»                                             */}
          {/* ---------------------------------------------------------- */}
          {activeTab === "overview" &&
            (hasTransactions ? (
              <>
                {incomeDonutData.length > 0 && (
                  <div className="mx-5 mt-6 bg-white rounded-2xl shadow-sm p-4">
                    <p className="text-sm font-bold text-gray-800">
                      Структура доходу
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Хто приносить більше грошей
                    </p>

                    <div className="flex items-center mt-2">
                      <div className="w-28 h-28 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={incomeDonutData}
                              dataKey="amount"
                              nameKey="name"
                              innerRadius={34}
                              outerRadius={54}
                              paddingAngle={3}
                              stroke="none"
                            >
                              {incomeDonutData.map((entry, idx) => (
                                <Cell
                                  key={`${entry.name}-${idx}`}
                                  fill={entry.color}
                                />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="flex-1 flex flex-col gap-2 pl-2">
                        {incomeDonutData.map((c) => (
                          <div
                            key={c.name}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: c.color }}
                              />
                              <span className="text-xs text-gray-500 truncate">
                                {c.name}
                              </span>
                            </div>
                            <span className="text-xs font-bold text-gray-800 pl-2">
                              {totalIncome > 0
                                ? Math.round((c.amount / totalIncome) * 100)
                                : 0}
                              %
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {topExpenses.length > 0 && (
                  <div className="mx-5 mt-4 bg-white rounded-2xl shadow-sm p-4">
                    <p className="text-sm font-bold text-gray-800">
                      Топ-3 статті витрат
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Головні «поглиначі» бюджету
                    </p>

                    <div className="flex flex-col gap-3 mt-4">
                      {topExpenses.map((e) => {
                        const Icon = CATEGORY_ICONS[e.name] || Receipt;
                        return (
                          <div key={e.name}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <Icon size={13} className="text-amber-600" />
                                <span className="text-xs font-medium text-gray-600">
                                  {e.name}
                                </span>
                              </div>
                              <span className="text-xs font-bold text-gray-800">
                                {formatMoney(e.amount)}
                              </span>
                            </div>
                            <div className="w-full h-2 bg-amber-50 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-400 rounded-full transition-all"
                                style={{ width: `${e.pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mx-5 mt-4 mb-8 bg-white rounded-2xl shadow-sm">
                  <p className="text-sm font-bold text-gray-800 px-4 pt-4">
                    Останні операції
                  </p>

                  <div className="flex flex-col mt-1">
                    {sortedTransactions.map((t, idx) => {
                      const name = t.category?.name || "Без категорії";
                      const Icon = CATEGORY_ICONS[name] || Receipt;
                      const isIncome = t.category?.type === "income";
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between px-4 py-3 ${
                            idx !== sortedTransactions.length - 1
                              ? "border-b border-gray-100"
                              : ""
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-9 h-9 flex items-center justify-center rounded-full shrink-0 ${
                                isIncome ? "bg-emerald-50" : "bg-amber-50"
                              }`}
                            >
                              <Icon
                                size={16}
                                className={
                                  isIncome
                                    ? "text-emerald-600"
                                    : "text-amber-600"
                                }
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">
                                {name}
                              </p>
                              <div className="flex items-center gap-1.5 min-w-0">
                                {t.note && (
                                  <span className="text-[11px] text-gray-400 truncate max-w-[120px]">
                                    {t.note}
                                  </span>
                                )}
                                {t.note && (
                                  <span className="text-[11px] text-gray-300">
                                    •
                                  </span>
                                )}
                                <span className="text-[11px] text-gray-400 shrink-0">
                                  {formatShortDate(t.transaction_date)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-sm font-bold shrink-0 pl-2 ${
                              isIncome ? "text-emerald-600" : "text-amber-600"
                            }`}
                          >
                            {isIncome ? "+" : "−"}
                            {formatMoney(t.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="mx-5 mt-8 mb-8 bg-white rounded-2xl shadow-sm px-6 py-12 flex flex-col items-center text-center">
                <div className="w-14 h-14 flex items-center justify-center bg-gray-50 rounded-full mb-4">
                  <Wallet size={26} className="text-gray-300" />
                </div>
                <p className="text-sm font-bold text-gray-700">
                  Почніть вести облік
                </p>
                <p className="text-xs text-gray-400 mt-1.5 max-w-[220px]">
                  Додайте свою першу операцію — і тут з'являться графіки та
                  статистика
                </p>
              </div>
            ))}

          {/* ---------------------------------------------------------- */}
          {/* Вкладка «Аналітика»                                        */}
          {/* ---------------------------------------------------------- */}
          {activeTab === "analytics" && (
            <div className="mt-6 mb-8">
              <div className="mx-5 bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-bold text-gray-800">
                  Дохід у порівнянні
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {MONTH_NAMES_UK[selectedDate.getMonth()]} проти{" "}
                  {MONTH_NAMES_UK[previousMonthDate.getMonth()]}
                </p>

                <div className="flex items-center justify-between mt-4">
                  <div>
                    <p className="text-2xl font-bold text-gray-800">
                      {formatMoney(totalIncome)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Минулого місяця: {formatMoney(previousIncome)}
                    </p>
                  </div>

                  {incomeChangePct === null ? (
                    <div className="flex items-center gap-1 bg-gray-50 rounded-full px-3 py-1.5">
                      <span className="text-xs font-semibold text-gray-400">
                        Немає даних
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center gap-1 rounded-full px-3 py-1.5 ${
                        incomeChangePct >= 0 ? "bg-emerald-50" : "bg-amber-50"
                      }`}
                    >
                      {incomeChangePct >= 0 ? (
                        <TrendingUp size={14} className="text-emerald-600" />
                      ) : (
                        <TrendingDown size={14} className="text-amber-600" />
                      )}
                      <span
                        className={`text-xs font-bold ${
                          incomeChangePct >= 0
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }`}
                      >
                        {incomeChangePct >= 0 ? "+" : ""}
                        {incomeChangePct.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mx-5 mt-4 bg-white rounded-2xl shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-800">
                      Маржинальність процедур
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      (Дохід − змінні витрати) / Дохід
                    </p>
                  </div>
                  <div className="w-9 h-9 flex items-center justify-center bg-sky-50 rounded-full shrink-0">
                    <Percent size={16} className="text-sky-600" />
                  </div>
                </div>

                <p className="text-3xl font-bold text-gray-800 mt-4">
                  {marginPct === null ? "—" : `${marginPct.toFixed(1)}%`}
                </p>
                {marginPct !== null && (
                  <div className="w-full h-2 bg-sky-50 rounded-full overflow-hidden mt-3">
                    <div
                      className="h-full bg-sky-400 rounded-full transition-all"
                      style={{
                        width: `${Math.max(0, Math.min(100, marginPct))}%`,
                      }}
                    />
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-2">
                  Змінні витрати: {formatMoney(variableExpense)}
                </p>
              </div>

              <div className="mx-5 mt-4 bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-bold text-gray-800">
                  Тренд прибутку
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Наростаючим підсумком за{" "}
                  {MONTH_NAMES_UK[selectedDate.getMonth()].toLowerCase()}
                </p>

                {trendData.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-6 mb-2">
                    Немає операцій за цей місяць
                  </p>
                ) : (
                  <div className="h-40 mt-3 -ml-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trendData}
                        margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid stroke="#F3F4F6" vertical={false} />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10, fill: "#9CA3AF" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#9CA3AF" }}
                          axisLine={false}
                          tickLine={false}
                          width={44}
                          tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                        />
                        <Tooltip
                          formatter={(value) => [
                            formatMoney(value),
                            "Прибуток",
                          ]}
                          labelFormatter={(label) => `День ${label}`}
                          contentStyle={{
                            borderRadius: 12,
                            border: "none",
                            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                            fontSize: 12,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="profit"
                          stroke="#9FB8D8"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: "#9FB8D8", strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Модальне вікно введення операції */}
      {modalType && (
        <div className="absolute inset-0 bg-white flex flex-col">
          <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-gray-100">
            <p className="text-base font-bold text-gray-800">
              {modalType === "income" ? "Новий дохід" : "Нова витрата"}
            </p>
            <button
              onClick={closeModal}
              className="w-9 h-9 flex items-center justify-center bg-gray-50 rounded-full transition-all hover:bg-gray-100"
              aria-label="Закрити"
            >
              <X size={17} className="text-gray-500" />
            </button>
          </div>

          <div className="flex-1 px-5 py-5 flex flex-col gap-5">
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Категорія
              </label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="mt-2 w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-white text-gray-800 transition-all focus:outline-none focus:border-gray-400"
              >
                <option value="">Оберіть категорію</option>
                {modalCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Сума, ₴
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0"
                className="mt-2 w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-white text-gray-800 transition-all focus:outline-none focus:border-gray-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Нотатка (необов'язково)
              </label>
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Наприклад, ім'я клієнта"
                className="mt-2 w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-white text-gray-800 transition-all focus:outline-none focus:border-gray-400"
              />
            </div>

            {formError && <p className="text-xs text-red-500">{formError}</p>}
          </div>

          <div className="px-5 pb-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`w-full text-white rounded-2xl py-3.5 text-sm font-bold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 ${
                modalType === "income"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              {saving ? "Збереження..." : "Зберегти"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
