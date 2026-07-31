import DbCrud from '@/components/shared/DbCrud'
export default function CargoPage() {
  return <DbCrud title="بار" subtitle="مدیریت اطلاعات بار" apiBase="/api/cargo"
    fields={[
      { key: 'name', label: 'نام بار', required: true },
      { key: 'code', label: 'کد بار' },
      { key: 'type', label: 'نوع بار', required: true },
      { key: 'packaging', label: 'نوع بسته‌بندی' },
      { key: 'description', label: 'توضیحات' },
    ]}
    columns={[
      { key: 'name', label: 'نام' },
      { key: 'code', label: 'کد' },
      { key: 'type', label: 'نوع' },
      { key: 'packaging', label: 'بسته‌بندی' },
    ]}
    searchKeys={['name', 'code', 'type']}
  />
}
