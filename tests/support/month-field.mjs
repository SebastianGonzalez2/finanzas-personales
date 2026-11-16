export async function chooseMonth(page, label, iso) {
  const [year, month] = iso.split("-");
  const group = page.getByRole("group", { name: label, exact: true });
  await group
    .getByRole("combobox", { name: "Mes", exact: true })
    .selectOption(month);
  await group.getByRole("textbox", { name: "Año", exact: true }).fill(year);
}
