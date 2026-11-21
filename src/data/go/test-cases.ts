import type { Json, TestCase } from '../js-ts/types';

const check = (args: string[], expected: Json): TestCase => ({ args, expected });

export const tests: Record<string, TestCase[]> = {
  program: [check(['"users"', '7'], 'users#7'), check(['"jobs"', '0'], 'jobs#0')],
  numbers: [check(['7', '2'], 3.5), check(['10', '0'], 0), check(['9', '3'], 3)],
  returns: [check(['"42"', '7'], 42), check(['"bad"', '7'], 7), check(['"0"', '7'], 0), check(['"-5"', '7'], -5)],
  flow: [check(['[]int{3, -2, 0}'], [6, 0, 0]), check(['[]int{}'], [])],
  unicode: [check(['"Go语言"', '3'], 'Go语'), check(['"😀a"', '1'], '😀'), check(['"你好"', '10'], '你好'), check(['"你好"', '0'], '')],
  slices: [check(['[]int{1, 2}', '[]int{3}'], [1, 2, 3]), check(['[]int{}', '[]int{}'], []), check(['[]int{}', '[]int{7}'], [7])],
  'slice-copy': [check(['[]int{1, 2}', '9'], [[1, 2], [9, 2]]), check(['[]int{}', '7'], [[], []])],
  maps: [check(['map[string]int{"go": 0}', '"go"', '7'], 0), check(['map[string]int{}', '"go"', '7'], 7), check(['map[string]int(nil)', '"go"', '-1'], -1)],
  structs: [check(['User{Name: "Lin"}', '"Wei"'], ['Lin', 'Wei']), check(['User{Name: "Lin"}', '""'], ['Lin', ''])],
  pointers: [check(['2', '4'], 6), check(['1', '-3'], -2), check(['0', '0'], 0)],
  methods: [check(['10', '[]int{5, -20, 3}'], -2), check(['4', '[]int{}'], 4)],
  embedding: [check(['Profile{Account: Account{ID: 7}, Name: "Lin"}'], 7), check(['Profile{}'], 0)],
  interfaces: [check(['10', '3'], 7), check(['2', '5'], 0), check(['0', '0'], 0)],
  'typed-nil': [check(['true'], true), check(['false'], false)],
  errors: [check(['true'], true), check(['false'], false)],
  defer: [check(['"db"', '"stream"'], ['stream', 'db']), check(['""', '"cache"'], ['cache', ''])],
  panic: [check(['true', '9'], -1), check(['false', '9'], 9), check(['false', '0'], 0)],
  packages: [check(['" Billing "', '" READY "'], 'billing/ready'), check(['""', '" Go "'], '/go')],
  generics: [check(['[]int{1, 3, 0}', '0'], true), check(['[]int{1, 3}', '2'], false), check(['[]int{}', '0'], false)],
  'table-tests': [
    check(['[]Case{{Input: -1, Want: 0}, {Input: 120, Want: 100}, {Input: 0, Want: 3}}'], [true, true, false]),
    check(['[]Case{}'], []),
  ],
  goroutines: [check(['7'], 49), check(['-3'], 9), check(['0'], 0)],
  channels: [check(['[]int{1, 2, 3}'], 6), check(['[]int{}'], 0), check(['[]int{0, -5}'], -5)],
  select: [check(['[]string{"start", "stop"}'], 'start'), check(['[]string{}'], '暂无'), check(['[]string{""}'], '')],
  waitgroup: [check(['[]int{1, 2, 3}'], 14), check(['[]int{}'], 0), check(['[]int{-4, 0}'], 16)],
  context: [check(['true'], '取消'), check(['false'], '继续')],
  json: [
    check(['`{"display_name":"Lin"}`'], 'Lin'), check(['`{"display_name":""}`'], '匿名'),
    check(['"oops"'], '匿名'), check(['`{"display_name":3}`'], '匿名'),
  ],
  validation: [check(['" 50 "'], 50), check(['"0"'], 20), check(['"100"'], 100), check(['"101"'], 20), check(['""'], 20)],
  dto: [
    check(['Record{ID: 7, Name: "Lin", Token: "secret"}'], '{"id":7,"label":"Lin"}'),
    check(['Record{}'], '{"id":0,"label":""}'),
  ],
  'http-response': [check(['"8"', 'true'], 200), check(['"8"', 'false'], 404), check(['"0"', 'true'], 400), check(['"?"', 'false'], 400)],
  'user-query': [
    check(['[]User{{ID: 3, Name: "LIN", Active: true, Score: 4}, {ID: 2, Name: "Li", Score: 9}, {ID: 1, Name: "Ling", Active: true, Score: 4}}', '" li "', 'true'], [1, 3]),
    check(['[]User{{ID: 3, Name: "Lin", Score: 4}, {ID: 2, Name: "Wei", Score: 9}}', '""', 'false'], [2, 3]),
    check(['[]User{{ID: 3, Name: "Lin", Active: true}}', '"zz"', 'false'], []),
  ],
};
