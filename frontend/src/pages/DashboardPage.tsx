import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  ArrowRight,
  ShoppingCart,
  Sparkles,
  Users,
  MapPin,
  CreditCard,
  Clock,
  Activity,
  TrendingUp,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, CardHeader, CardTitle, KPICard, Button, Badge } from '@/components/ui';
import { MOCK_KPIS, SALES_CHART_DATA, TOP_PRODUCTS } from '@/utils/mockData';
import {
  DEMOGRAPHICS_DATA,
  TOP_AREAS_DATA,
  PAYMENT_METHODS_DATA,
  PEAK_HOURS_DATA,
  RECENT_ACTIVITY,
  CUSTOMER_INSIGHTS,
  COUNTER_PERFORMANCE,
} from '@/utils/analyticsData';
import { formatCurrency, formatCurrencyCompact } from '@/utils';
import { useTranslation } from '@/i18n';

export default function DashboardPage() {
  const { t } = useTranslation();
  const hour = new Date().getHours();
  const subtitle =
    hour < 12
      ? t('dashboard.subtitleMorning')
      : hour < 17
        ? t('dashboard.subtitleAfternoon')
        : t('dashboard.subtitleEvening');

  return (
    <>
      <Header
        title={t('dashboard.title')}
        subtitle={subtitle}
        actions={
          <Link to="/pos">
            <Button variant="accent" size="md">
              <ShoppingCart className="h-4 w-4" />
              {t('common.openPos')}
            </Button>
          </Link>
        }
      />

      <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Hero */}
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-brand-200/60 bg-gradient-to-r from-brand-900 via-brand-800 to-accent p-4 text-white shadow-elevated sm:p-6 dark:border-brand-800">
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
          <div className="absolute -bottom-4 right-20 h-24 w-24 rounded-full bg-accent-glow/20 blur-xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-white/70">
                <Sparkles className="h-4 w-4" />
                <span>{t('dashboard.heroBadge')} · {t('common.pakistan')}</span>
              </div>
              <h2 className="font-display text-2xl font-bold">{t('dashboard.heroTitle')}</h2>
              <p className="mt-1 max-w-lg text-sm text-white/60">{t('dashboard.heroDesc')}</p>
            </div>
            <Link to="/pos" className="hidden sm:block">
              <Button size="lg" className="bg-white text-brand-900 hover:bg-brand-100">
                <ShoppingCart className="h-5 w-5" />
                {t('common.startBilling')}
              </Button>
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MOCK_KPIS.map((kpi) => (
            <KPICard key={kpi.labelKey} {...kpi} />
          ))}
        </div>

        {/* Customer Insights strip */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: UserPlus, label: t('dashboard.newCustomers'), value: CUSTOMER_INSIGHTS.newCustomers, color: 'text-blue-600' },
            { icon: RefreshCw, label: t('dashboard.returningCustomers'), value: CUSTOMER_INSIGHTS.returningCustomers, color: 'text-emerald-600' },
            { icon: ShoppingCart, label: t('dashboard.avgBasketSize'), value: `${CUSTOMER_INSIGHTS.avgBasketSize} ${t('common.items')}`, color: 'text-violet-600' },
            { icon: TrendingUp, label: t('dashboard.customerRetention'), value: `${CUSTOMER_INSIGHTS.retentionRate}%`, color: 'text-accent' },
          ].map((item) => (
            <Card key={item.label} padding="sm" hover className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-800">
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <p className="text-xs text-brand-500">{item.label}</p>
                <p className="font-display text-xl font-bold">{item.value}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Sales chart + Demographics */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2" hover>
            <CardHeader>
              <div>
                <CardTitle>{t('dashboard.salesByCounter')}</CardTitle>
                <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.salesByCounterDesc')}</p>
              </div>
              <Badge>{t('common.pkr')}</Badge>
            </CardHeader>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={SALES_CHART_DATA}>
                  <defs>
                    <linearGradient id="c1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#01411C" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#01411C" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="c2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#71717a" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#71717a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} width={70} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), '']} contentStyle={{ borderRadius: '16px', fontSize: '13px' }} />
                  <Area type="monotone" dataKey="counter1" name="Counter 1" stroke="#01411C" fill="url(#c1)" strokeWidth={2.5} />
                  <Area type="monotone" dataKey="counter2" name="Counter 2" stroke="#71717a" fill="url(#c2)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card hover>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-accent" />
                  {t('dashboard.demographics')}
                </CardTitle>
                <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.demographicsDesc')}</p>
              </div>
            </CardHeader>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={DEMOGRAPHICS_DATA} dataKey="customers" nameKey="ageGroup" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {DEMOGRAPHICS_DATA.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value}%`, '']} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Areas + Payment + Peak hours */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card hover>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-accent" />
                  {t('dashboard.topAreas')}
                </CardTitle>
                <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.topAreasDesc')}</p>
              </div>
            </CardHeader>
            <div className="space-y-3">
              {TOP_AREAS_DATA.map((area) => (
                <div key={area.area}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{area.area}</span>
                    <span className="text-brand-500">{area.customers} · {area.percentage}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-accent-glow transition-all"
                      style={{ width: `${area.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card hover>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-accent" />
                  {t('dashboard.paymentMethods')}
                </CardTitle>
                <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.paymentMethodsDesc')}</p>
              </div>
            </CardHeader>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={PAYMENT_METHODS_DATA} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} ${value}%`} labelLine={false}>
                    {PAYMENT_METHODS_DATA.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card hover>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-accent" />
                  {t('dashboard.peakHours')}
                </CardTitle>
                <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.peakHoursDesc')}</p>
              </div>
            </CardHeader>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PEAK_HOURS_DATA}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(0 0 0 / 0.06)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="sales" fill="#01411C" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Top products + Recent activity + Counter performance */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card hover>
            <CardHeader>
              <CardTitle>{t('dashboard.topProducts')}</CardTitle>
            </CardHeader>
            <div className="space-y-1">
              {TOP_PRODUCTS.map((product, i) => (
                <div key={product.name} className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-brand-50 dark:hover:bg-brand-800/40">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${i === 0 ? 'bg-accent/15 text-accent' : 'bg-brand-100 text-brand-600 dark:bg-brand-800'}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-brand-500">{product.sales} {t('dashboard.unitsSold')}</p>
                  </div>
                  <p className="text-sm font-bold">{formatCurrency(product.revenue)}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card hover>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-accent" />
                  {t('dashboard.recentActivity')}
                </CardTitle>
                <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.recentActivityDesc')}</p>
              </div>
            </CardHeader>
            <div className="space-y-3">
              {RECENT_ACTIVITY.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-brand-100 p-3 dark:border-brand-800">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    item.type === 'sale' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50' :
                    item.type === 'stock' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50' :
                    'bg-blue-50 text-blue-600 dark:bg-blue-950/50'
                  }`}>
                    {item.type === 'sale' ? '₨' : item.type === 'stock' ? '!' : 'P'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.desc}</p>
                    <p className="text-xs text-brand-500">{item.counter} {item.method && `· ${item.method}`} · {item.time}</p>
                  </div>
                  {item.amount > 0 && (
                    <p className="text-sm font-bold">{formatCurrency(item.amount)}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card hover>
            <CardHeader>
              <CardTitle>{t('dashboard.counterPerformance')}</CardTitle>
              <Badge variant="success">+{CUSTOMER_INSIGHTS.growth}% {t('dashboard.growth')}</Badge>
            </CardHeader>
            <div className="space-y-4">
              {COUNTER_PERFORMANCE.map((c) => (
                <div key={c.counter} className="rounded-xl border border-brand-100 p-4 dark:border-brand-800">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{c.counter}</p>
                    <Badge>{c.transactions} txns</Badge>
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold">{formatCurrency(c.sales)}</p>
                  <p className="mt-1 text-xs text-brand-500">Avg. {formatCurrency(c.avgBill)} / bill</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Stock alerts */}
        <Card className="mt-6" hover>
          <CardHeader>
            <CardTitle>{t('dashboard.stockAlerts')}</CardTitle>
            <Link to="/inventory">
              <Button variant="ghost" size="sm">
                {t('dashboard.viewInventory')} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: t('dashboard.outOfStock'), count: 3, variant: 'danger' as const, desc: t('dashboard.needsRestock') },
              { label: t('dashboard.lowStock'), count: 14, variant: 'warning' as const, desc: t('dashboard.belowThreshold') },
              { label: t('dashboard.inStock'), count: 186, variant: 'success' as const, desc: t('dashboard.healthyLevels') },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-800/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.label}</span>
                  <Badge variant={item.variant}>{item.count}</Badge>
                </div>
                <p className="mt-1 text-xs text-brand-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </main>
    </>
  );
}
