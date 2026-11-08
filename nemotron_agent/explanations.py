"""Plain-language rendering of verified engine evidence. No forecasting or model calls."""
from decimal import Decimal


def money(value, currency):
    amount = Decimal(value)
    text = format(abs(amount), ',.2f')
    if text.endswith('.00'):
        text = text[:-3]
    sign = '-' if amount < 0 else ''
    return f'{sign}${text}' if currency == 'USD' else f'{sign}{text} {currency}'


def decision_summary(results, reserve, currency):
    purchase = results['purchase']
    stress = [results[name] for name in ('delayed_income', 'unexpected_expense')
              if results[name]['applicable']]
    failed = [test for test in stress if not test['maintains_reserve']]
    minimum = money(purchase['forecast']['minimum_balance'], currency)
    cushion = money(str(reserve), currency)
    if purchase['forecast']['shortfall_occurs']:
        answer = "I wouldn't buy this right now."
        reason = f'At its lowest, your balance could fall to {minimum}, below zero.'
    elif not purchase['maintains_reserve']:
        answer = "I'd wait before buying this."
        reason = f'Your balance could fall to {minimum}, below the {cushion} safety cushion you chose.'
    elif failed:
        answer = "I'd be cautious about buying this."
        concern = ('a late paycheck or an unexpected bill' if len(failed) > 1 else
                   'a late paycheck' if failed[0]['name'] == 'delayed_income' else
                   'an unexpected bill')
        reason = f'Your forecast keeps your cushion if things go as expected, but {concern} in our what-if tests could leave you short.'
    elif not results['baseline']['forecast']['transaction_timeline']:
        answer = "I don't have enough information to recommend this yet."
        reason = "We don't have upcoming bills or income for this account, so a flat forecast is not enough."
    else:
        answer = 'This fits your selected cash cushion in the scenarios we tested.'
        reason = f'At its lowest, your balance could fall to {minimum}; it also keeps your cushion in the applicable what-if tests.'
    return f"{answer} {reason} We might not know about all your upcoming bills, and category budgets and protected savings are still unknown."
