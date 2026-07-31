import DbCrud from '@/components/shared/DbCrud'
export default function SendersPage() {
  return <DbCrud title="فرستندگان" subtitle="مدیریت اطلاعات فرستندگان" apiBase="/api/senders"
    fields={[
      { key: 'name', label: 'نام', required: true },
      { key: 'nationalId', label: 'کد ملی / شناسه'},
      { key: 'phone', label: 'تلفن', required: true },
      { key: 'address', label: 'آدرس' },
      { key: 'postalCode', label: 'کد پستی' },
    ]}
    columns={[
      { key: 'name', label: 'نام' },
      { key: 'nationalId', label: 'کد ملی' },
      { key: 'phone', label: 'تلفن' },
      { key: 'address', label: 'آدرس' },
    ]}
    searchKeys={['name', 'nationalId', 'phone']}
  />
}
