from app.api.payments import _normalise_plan_row, _normalise_subscription_row


def test_normalise_plan_row_uses_plan_code_as_public_id():
    row = {
        "id": "88d28c38-24e9-421a-bcf0-d7bb111c1381",
        "plan_code": "pro",
        "name": "Pro",
        "price_inr": 19900,
    }

    plan = _normalise_plan_row(row)

    assert plan["id"] == "pro"
    assert plan["db_id"] == "88d28c38-24e9-421a-bcf0-d7bb111c1381"
    assert plan["price_inr"] == 19900


def test_normalise_plan_row_keeps_uuid_id_when_plan_code_missing():
    row = {
        "id": "88d28c38-24e9-421a-bcf0-d7bb111c1381",
        "name": "Legacy",
        "price": 199,
    }

    plan = _normalise_plan_row(row)

    assert plan["id"] == "88d28c38-24e9-421a-bcf0-d7bb111c1381"
    assert plan["db_id"] == "88d28c38-24e9-421a-bcf0-d7bb111c1381"
    assert plan["price_inr"] == 19900


def test_normalise_subscription_row_maps_nested_plan_to_public_plan_id():
    row = {
        "id": "sub_1",
        "plan_id": "88d28c38-24e9-421a-bcf0-d7bb111c1381",
        "plan": {
            "id": "88d28c38-24e9-421a-bcf0-d7bb111c1381",
            "plan_code": "elite",
            "name": "Elite",
            "price_inr": 199900,
        },
    }

    subscription = _normalise_subscription_row(row)

    assert subscription["plan_id"] == "elite"
    assert subscription["plan"]["id"] == "elite"
    assert subscription["plan"]["db_id"] == "88d28c38-24e9-421a-bcf0-d7bb111c1381"
