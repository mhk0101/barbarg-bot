import DbCrud from '@/components/shared/DbCrud'
export default function CompaniesPage() {
  return <DbCrud title="شرکت‌ها" subtitle="مدیریت شرکت‌های حمل بار" apiBase="/api/companies"
    fields={[
      { key: 'name', label: 'نام شرکت', required: true },
      { key: 'nationalId', label: 'شناسه ملی', required: true },
      { key: 'phone', label: 'تلفن' },
      { key: 'address', label: 'آدرس' },
    ]}
    columns={[
      { key: 'name', label: 'نام شرکت' },
      { key: 'nationalId', label: 'شناسه ملی' },
      { key: 'phone', label: 'تلفن' },
      { key: 'address', label: 'آدرس' },
    ]}
    searchKeys={['name', 'nationalId', 'phone']}
  />
}
